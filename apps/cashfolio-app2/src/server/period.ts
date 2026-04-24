import { createServerFn } from "@tanstack/react-start";
import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../.prisma-client/enums";
import { ensureAuthorizedForAccountBookId } from "../account-books/functions.server";
import { prisma } from "../prisma.server";
import {
  DEFAULT_PERIOD_VALUE,
  isSupportedPeriodValue,
  normalizePeriodValue,
  PERIOD_PRESET_LAST_MONTH,
  PERIOD_PRESET_LAST_YEAR,
  PERIOD_PRESET_MTD,
  PERIOD_PRESET_VALUES,
  PERIOD_PRESET_YTD,
  type PeriodPresetValue,
} from "../shared/period";
import { startOfUtcDay } from "../shared/date";
import {
  buildBreakdownHierarchy,
  buildBreakdownItems,
  computeHoldingGainLossForEventSeries,
  createBreakdownBucket,
  filterConvertibleHoldingAccounts,
  isMultiUnitTransaction,
  shouldIncludeTransactionForPeriod,
} from "./period-helpers";
import {
  convertBookingValueToReference,
  getUnitToReferenceExchangeRate,
} from "./period-conversion";
import {
  getPeriodEndExclusive,
  resolvePeriodSelection,
  type PeriodSpecifier,
} from "./period-selection";
import {
  computeEndOfPeriodBalanceStats,
  computeEndOfPeriodBalanceStatsWithConvertedBalances,
  type EndOfPeriodBalanceAccount,
} from "./period-balance-stats";
import {
  accumulateConvertedEquityBooking,
  createPeriodOverviewEquityAggregation,
} from "./period-overview-aggregation";
import {
  applyHoldingTransactionsToGainLossState,
  finalizeHoldingGainLossState,
  initializeHoldingGainLossState,
} from "./period-overview-holdings";
import {
  applyExecutionToLots,
  isNearZero,
  QUANTITY_EPSILON,
} from "./period-overview-holdings-common";
import { buildPeriodOverviewResponse } from "./period-overview-response";

export {
  DEFAULT_PERIOD_VALUE,
  isSupportedPeriodValue,
  normalizePeriodValue,
  PERIOD_PRESET_LAST_MONTH,
  PERIOD_PRESET_LAST_YEAR,
  PERIOD_PRESET_MTD,
  PERIOD_PRESET_VALUES,
  PERIOD_PRESET_YTD,
};
export type { PeriodPresetValue };
export type { PeriodSpecifier };
export {
  buildBreakdownHierarchy,
  buildBreakdownItems,
  computeEndOfPeriodBalanceStats,
  getPeriodEndExclusive,
  computeHoldingGainLossForEventSeries,
  createBreakdownBucket,
  isMultiUnitTransaction,
  resolvePeriodSelection,
  shouldIncludeTransactionForPeriod,
};

const EQUITY_BOOKINGS_PAGE_SIZE = 1_000;
const TRANSACTIONS_PAGE_SIZE = 200;
const TRANSFER_CLEARING_BOOKINGS_PAGE_SIZE = 1_000;

const TRANSFER_CLEARING_ROOT_GROUP_ID = "virtual:transfer-clearing";
const TRANSFER_CLEARING_CURRENCY_GROUP_ID =
  "virtual:transfer-clearing:currency";
const TRANSFER_CLEARING_SECURITY_GROUP_ID =
  "virtual:transfer-clearing:security";
const TRANSFER_CLEARING_CRYPTOCURRENCY_GROUP_ID =
  "virtual:transfer-clearing:cryptocurrency";

type TransferClearingBooking = {
  id: string;
  date: Date;
  value: number;
  unit: Unit;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
};

type TransferClearingUnitType = "currency" | "security" | "cryptocurrency";

type TransferClearingUnitBucket = {
  unitKey: string;
  unitLabel: string;
  unitType: TransferClearingUnitType;
  unit: Unit;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
  isNonReferenceUnit: boolean;
  rawBalance: number;
  bookings: TransferClearingBooking[];
};

type TransferClearingVirtualGroup = {
  id: string;
  name: string;
  parentGroupId: string | null;
};

type TransferClearingVirtualAccount = EndOfPeriodBalanceAccount & {
  name: string;
  groupId: string | null;
};

function addUtcDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function toTransferClearingLotSortKey(args: { date: Date; bookingId: string }) {
  return `${args.date.toISOString()}::${args.bookingId}`;
}

function getTransferClearingUnitTypeGroupId(
  unitType: TransferClearingUnitType,
) {
  if (unitType === "currency") {
    return TRANSFER_CLEARING_CURRENCY_GROUP_ID;
  }
  if (unitType === "security") {
    return TRANSFER_CLEARING_SECURITY_GROUP_ID;
  }
  return TRANSFER_CLEARING_CRYPTOCURRENCY_GROUP_ID;
}

function getTransferClearingUnitTypeLabel(unitType: TransferClearingUnitType) {
  if (unitType === "currency") {
    return "Currency";
  }
  if (unitType === "security") {
    return "Security";
  }
  return "Cryptocurrency";
}

function toTransferClearingUnitDescriptor(args: {
  booking: TransferClearingBooking;
  referenceCurrency: string;
}): Omit<TransferClearingUnitBucket, "rawBalance" | "bookings"> | null {
  if (args.booking.unit === Unit.CURRENCY) {
    if (!args.booking.currency) {
      return null;
    }
    const normalizedCurrency = args.booking.currency.toUpperCase();
    return {
      unitKey: `currency:${normalizedCurrency}`,
      unitLabel: normalizedCurrency,
      unitType: "currency",
      unit: Unit.CURRENCY,
      currency: normalizedCurrency,
      cryptocurrency: null,
      symbol: null,
      tradeCurrency: null,
      isNonReferenceUnit: normalizedCurrency !== args.referenceCurrency,
    };
  }

  if (args.booking.unit === Unit.SECURITY) {
    if (!args.booking.symbol || !args.booking.tradeCurrency) {
      return null;
    }
    const normalizedSymbol = args.booking.symbol.toUpperCase();
    const normalizedTradeCurrency = args.booking.tradeCurrency.toUpperCase();
    return {
      unitKey: `security:${normalizedSymbol}:${normalizedTradeCurrency}`,
      unitLabel: `${normalizedSymbol}:${normalizedTradeCurrency}`,
      unitType: "security",
      unit: Unit.SECURITY,
      currency: null,
      cryptocurrency: null,
      symbol: normalizedSymbol,
      tradeCurrency: normalizedTradeCurrency,
      isNonReferenceUnit: true,
    };
  }

  if (!args.booking.cryptocurrency) {
    return null;
  }
  const normalizedCryptocurrency = args.booking.cryptocurrency.toUpperCase();
  return {
    unitKey: `crypto:${normalizedCryptocurrency}`,
    unitLabel: normalizedCryptocurrency,
    unitType: "cryptocurrency",
    unit: Unit.CRYPTOCURRENCY,
    currency: null,
    cryptocurrency: normalizedCryptocurrency,
    symbol: null,
    tradeCurrency: null,
    isNonReferenceUnit: true,
  };
}

async function loadTransferClearingBookings(args: {
  accountBookId: string;
  periodEndExclusive: Date;
}): Promise<TransferClearingBooking[]> {
  const results: TransferClearingBooking[] = [];
  let nextBookingIdCursor: string | undefined;

  while (true) {
    const bookingsPage = await prisma.booking.findMany({
      where: {
        accountBookId: args.accountBookId,
        date: { lt: args.periodEndExclusive },
        account: {
          type: {
            in: [AccountType.ASSET, AccountType.LIABILITY],
          },
        },
        transaction: {
          bookings: {
            some: {
              date: {
                gte: args.periodEndExclusive,
              },
            },
          },
        },
      },
      orderBy: { id: "asc" },
      take: TRANSFER_CLEARING_BOOKINGS_PAGE_SIZE,
      ...(nextBookingIdCursor
        ? {
            cursor: {
              id_accountBookId: {
                id: nextBookingIdCursor,
                accountBookId: args.accountBookId,
              },
            },
            skip: 1,
          }
        : {}),
      select: {
        id: true,
        date: true,
        value: true,
        unit: true,
        currency: true,
        cryptocurrency: true,
        symbol: true,
        tradeCurrency: true,
      },
    });

    if (bookingsPage.length === 0) {
      break;
    }

    for (const booking of bookingsPage) {
      results.push({
        id: booking.id,
        date: booking.date,
        value: Number(booking.value),
        unit: booking.unit,
        currency: booking.currency,
        cryptocurrency: booking.cryptocurrency,
        symbol: booking.symbol,
        tradeCurrency: booking.tradeCurrency,
      });
    }

    nextBookingIdCursor = bookingsPage[bookingsPage.length - 1].id;
    if (bookingsPage.length < TRANSFER_CLEARING_BOOKINGS_PAGE_SIZE) {
      break;
    }
  }

  return results;
}

function aggregateTransferClearingUnitBuckets(args: {
  bookings: TransferClearingBooking[];
  referenceCurrency: string;
}): TransferClearingUnitBucket[] {
  const unitBucketByKey = new Map<string, TransferClearingUnitBucket>();

  for (const booking of args.bookings) {
    const descriptor = toTransferClearingUnitDescriptor({
      booking,
      referenceCurrency: args.referenceCurrency,
    });
    if (!descriptor) {
      continue;
    }

    const existing = unitBucketByKey.get(descriptor.unitKey);
    if (existing) {
      existing.rawBalance += booking.value;
      existing.bookings.push(booking);
      continue;
    }

    unitBucketByKey.set(descriptor.unitKey, {
      ...descriptor,
      rawBalance: booking.value,
      bookings: [booking],
    });
  }

  return Array.from(unitBucketByKey.values()).sort(
    (left, right) =>
      left.unitLabel.localeCompare(right.unitLabel, "en") ||
      left.unitKey.localeCompare(right.unitKey, "en"),
  );
}

function buildTransferClearingVirtualHierarchy(args: {
  unitBuckets: TransferClearingUnitBucket[];
}) {
  const nonZeroBuckets = args.unitBuckets.filter(
    (bucket) => !isNearZero(bucket.rawBalance),
  );
  if (nonZeroBuckets.length === 0) {
    return {
      virtualGroups: [] as TransferClearingVirtualGroup[],
      virtualAccounts: [] as TransferClearingVirtualAccount[],
      rawBalanceByVirtualAccountId: new Map<string, number>(),
    };
  }

  const rootGroup: TransferClearingVirtualGroup = {
    id: TRANSFER_CLEARING_ROOT_GROUP_ID,
    name: "Transfer Clearing",
    parentGroupId: null,
  };
  const virtualGroups: TransferClearingVirtualGroup[] = [rootGroup];

  const presentUnitTypes = new Set(
    nonZeroBuckets.map((bucket) => bucket.unitType),
  );
  const orderedUnitTypes: TransferClearingUnitType[] = [
    "currency",
    "security",
    "cryptocurrency",
  ];
  for (const unitType of orderedUnitTypes) {
    if (!presentUnitTypes.has(unitType)) {
      continue;
    }
    virtualGroups.push({
      id: getTransferClearingUnitTypeGroupId(unitType),
      name: getTransferClearingUnitTypeLabel(unitType),
      parentGroupId: TRANSFER_CLEARING_ROOT_GROUP_ID,
    });
  }

  const virtualAccounts: TransferClearingVirtualAccount[] = [];
  const rawBalanceByVirtualAccountId = new Map<string, number>();
  for (const bucket of nonZeroBuckets) {
    const clearingRawBalance = -bucket.rawBalance;
    const accountId = `virtual:transfer-clearing:account:${bucket.unitKey}`;
    virtualAccounts.push({
      id: accountId,
      name: bucket.unitLabel,
      groupId: getTransferClearingUnitTypeGroupId(bucket.unitType),
      type: clearingRawBalance > 0 ? AccountType.ASSET : AccountType.LIABILITY,
      unit: bucket.unit,
      currency: bucket.currency,
      cryptocurrency: bucket.cryptocurrency,
      symbol: bucket.symbol,
      tradeCurrency: bucket.tradeCurrency,
    });
    rawBalanceByVirtualAccountId.set(accountId, clearingRawBalance);
  }

  return {
    virtualGroups,
    virtualAccounts,
    rawBalanceByVirtualAccountId,
  };
}

async function computeTransferClearingGainLossSplit(args: {
  unitBuckets: TransferClearingUnitBucket[];
  periodStart: Date;
  periodEndExclusive: Date;
  initialRateDate: Date;
  periodEnd: Date;
  resolveRate: (input: {
    unit: Unit;
    currency: string | null;
    cryptocurrency: string | null;
    symbol: string | null;
    tradeCurrency: string | null;
    date: Date;
  }) => Promise<number | null>;
  convertBookingToReference: (
    booking: TransferClearingBooking,
  ) => Promise<number | null>;
}) {
  let realizedGainLoss = 0;
  let unrealizedGainLoss = 0;
  let convertedCount = 0;
  let skippedCount = 0;

  for (const unitBucket of args.unitBuckets) {
    if (!unitBucket.isNonReferenceUnit) {
      continue;
    }

    const lots: Array<{
      quantity: number;
      unitCostInReference: number;
      acquisitionSortKey: string;
    }> = [];
    const openingPostedBalance = unitBucket.bookings
      .filter((booking) => booking.date < args.periodStart)
      .reduce((sum, booking) => sum + booking.value, 0);
    const openingBalance = -openingPostedBalance;

    if (!isNearZero(openingBalance)) {
      const initialRate = await args.resolveRate({
        unit: unitBucket.unit,
        currency: unitBucket.currency,
        cryptocurrency: unitBucket.cryptocurrency,
        symbol: unitBucket.symbol,
        tradeCurrency: unitBucket.tradeCurrency,
        date: args.initialRateDate,
      });
      if (initialRate == null) {
        skippedCount += 1;
        continue;
      }

      lots.push({
        quantity: openingBalance,
        unitCostInReference: initialRate,
        acquisitionSortKey: toTransferClearingLotSortKey({
          date: args.initialRateDate,
          bookingId: `opening:${unitBucket.unitKey}`,
        }),
      });
    }

    const inPeriodBookings = unitBucket.bookings
      .filter(
        (booking) =>
          booking.date >= args.periodStart &&
          booking.date < args.periodEndExclusive,
      )
      .sort((left, right) => {
        const dateDiff = left.date.getTime() - right.date.getTime();
        if (dateDiff !== 0) {
          return dateDiff;
        }
        return left.id.localeCompare(right.id, "en");
      });

    for (const booking of inPeriodBookings) {
      if (isNearZero(booking.value)) {
        skippedCount += 1;
        continue;
      }

      const convertedValue = await args.convertBookingToReference(booking);
      if (convertedValue == null) {
        skippedCount += 1;
        continue;
      }

      const clearingQuantity = -booking.value;
      const clearingReferenceAmount = -convertedValue;
      const executionUnitPriceInReference =
        clearingReferenceAmount / clearingQuantity;
      if (!Number.isFinite(executionUnitPriceInReference)) {
        skippedCount += 1;
        continue;
      }
      convertedCount += 1;

      realizedGainLoss += applyExecutionToLots({
        lots,
        quantity: clearingQuantity,
        executionUnitPriceInReference,
        acquisitionSortKey: toTransferClearingLotSortKey({
          date: booking.date,
          bookingId: booking.id,
        }),
      });
    }

    const openQuantity = lots.reduce(
      (sum, lot) => sum + Math.abs(lot.quantity),
      0,
    );
    if (openQuantity <= QUANTITY_EPSILON) {
      continue;
    }

    const periodEndRate = await args.resolveRate({
      unit: unitBucket.unit,
      currency: unitBucket.currency,
      cryptocurrency: unitBucket.cryptocurrency,
      symbol: unitBucket.symbol,
      tradeCurrency: unitBucket.tradeCurrency,
      date: args.periodEnd,
    });
    if (periodEndRate == null) {
      skippedCount += 1;
      continue;
    }

    unrealizedGainLoss += lots.reduce(
      (sum, lot) =>
        sum + lot.quantity * (periodEndRate - lot.unitCostInReference),
      0,
    );
  }

  return {
    realizedGainLoss,
    unrealizedGainLoss,
    convertedCount,
    skippedCount,
  };
}

export const getPeriodOverview = createServerFn({
  method: "GET",
})
  .inputValidator((data: { accountBookId: string; period?: unknown }) => ({
    accountBookId: data.accountBookId,
    period: normalizePeriodValue(data.period),
  }))
  .handler(async ({ data }) => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);

    const accountBook = await prisma.accountBook.findUniqueOrThrow({
      where: { id: data.accountBookId },
      select: {
        referenceCurrency: true,
        startDate: true,
      },
    });

    const referenceCurrency = accountBook.referenceCurrency.toUpperCase();
    const [allAccountGroups, baseAssetLiabilityAccounts] = await Promise.all([
      prisma.accountGroup.findMany({
        where: { accountBookId: data.accountBookId },
        select: {
          id: true,
          name: true,
          parentGroupId: true,
        },
      }),
      prisma.account.findMany({
        where: {
          accountBookId: data.accountBookId,
          type: {
            in: [AccountType.ASSET, AccountType.LIABILITY],
          },
        },
        select: {
          id: true,
          name: true,
          groupId: true,
          type: true,
          unit: true,
          currency: true,
          cryptocurrency: true,
          symbol: true,
          tradeCurrency: true,
        },
      }),
    ]);

    const holdingAccountsResolved = filterConvertibleHoldingAccounts(
      baseAssetLiabilityAccounts,
      referenceCurrency,
    );

    const accountBookStartDate = startOfUtcDay(accountBook.startDate);
    const minPeriodDate = accountBookStartDate;

    const selection = resolvePeriodSelection({
      periodValue: data.period,
      now: new Date(),
      firstBookingDate: minPeriodDate,
    });
    const isBeforeAccountBookStart = selection.to < accountBookStartDate;

    const queryStart = selection.from;
    const queryEndExclusive = getPeriodEndExclusive(selection.to);
    const initialHoldingDate = addUtcDays(queryStart, -1);

    const exchangeRateByKey = new Map<string, Promise<number | null>>();
    const assetLiabilityAccountIds = baseAssetLiabilityAccounts.map(
      (account) => account.id,
    );
    const endOfPeriodRawBalanceByAccountId = new Map(
      (assetLiabilityAccountIds.length > 0
        ? await prisma.booking.groupBy({
            by: ["accountId"],
            where: {
              accountBookId: data.accountBookId,
              accountId: { in: assetLiabilityAccountIds },
              date: { lt: queryEndExclusive },
            },
            _sum: { value: true },
          })
        : []
      ).map((balance) => [balance.accountId, Number(balance._sum.value ?? 0)]),
    );
    const transferClearingBookings = await loadTransferClearingBookings({
      accountBookId: data.accountBookId,
      periodEndExclusive: queryEndExclusive,
    });
    const transferClearingUnitBuckets = aggregateTransferClearingUnitBuckets({
      bookings: transferClearingBookings,
      referenceCurrency,
    });
    const {
      virtualGroups: transferClearingVirtualGroups,
      virtualAccounts: transferClearingVirtualAccounts,
      rawBalanceByVirtualAccountId,
    } = buildTransferClearingVirtualHierarchy({
      unitBuckets: transferClearingUnitBuckets,
    });

    const groupById = new Map(
      allAccountGroups.map((group) => [group.id, group]),
    );
    for (const virtualGroup of transferClearingVirtualGroups) {
      groupById.set(virtualGroup.id, virtualGroup);
    }

    const assetLiabilityAccounts = [
      ...baseAssetLiabilityAccounts,
      ...transferClearingVirtualAccounts,
    ];
    // Intentionally keep posted real-account balances: virtual transfer-clearing
    // accounts represent the missing counterpart leg with opposite sign.
    for (const [accountId, rawBalance] of rawBalanceByVirtualAccountId) {
      endOfPeriodRawBalanceByAccountId.set(accountId, rawBalance);
    }

    let bookingsCount = 0;
    let convertedBookingsCount = 0;
    let skippedBookingsCount = 0;

    const equityAggregation = createPeriodOverviewEquityAggregation();

    let nextBookingIdCursor: string | undefined;
    let realizedGainLoss = 0;
    let unrealizedGainLoss = 0;

    if (!isBeforeAccountBookStart) {
      while (true) {
        const bookingsPage = await prisma.booking.findMany({
          where: {
            accountBookId: data.accountBookId,
            date: {
              gte: queryStart,
              lt: queryEndExclusive,
            },
            account: {
              type: AccountType.EQUITY,
              equityAccountSubtype: {
                in: [
                  EquityAccountSubtype.INCOME,
                  EquityAccountSubtype.EXPENSE,
                  EquityAccountSubtype.GAIN_LOSS,
                ],
              },
            },
          },
          orderBy: { id: "asc" },
          take: EQUITY_BOOKINGS_PAGE_SIZE,
          ...(nextBookingIdCursor
            ? {
                cursor: {
                  id_accountBookId: {
                    id: nextBookingIdCursor,
                    accountBookId: data.accountBookId,
                  },
                },
                skip: 1,
              }
            : {}),
          select: {
            id: true,
            date: true,
            value: true,
            unit: true,
            currency: true,
            cryptocurrency: true,
            symbol: true,
            tradeCurrency: true,
            account: {
              select: {
                id: true,
                name: true,
                groupId: true,
                equityAccountSubtype: true,
              },
            },
          },
        });

        if (bookingsPage.length === 0) {
          break;
        }

        bookingsCount += bookingsPage.length;
        nextBookingIdCursor = bookingsPage[bookingsPage.length - 1].id;

        const conversionTasks = bookingsPage.map((booking) => ({
          booking,
          convertedValuePromise: convertBookingValueToReference({
            value: Number(booking.value),
            unit: booking.unit,
            currency: booking.currency,
            cryptocurrency: booking.cryptocurrency,
            symbol: booking.symbol,
            tradeCurrency: booking.tradeCurrency,
            date: booking.date,
            referenceCurrency,
            exchangeRateByKey,
          }),
        }));

        const convertedValues = await Promise.all(
          conversionTasks.map((task) => task.convertedValuePromise),
        );

        for (let index = 0; index < conversionTasks.length; index += 1) {
          const booking = conversionTasks[index]!.booking;
          const convertedValue = convertedValues[index];

          if (convertedValue == null) {
            skippedBookingsCount += 1;
            continue;
          }

          convertedBookingsCount += 1;
          accumulateConvertedEquityBooking({
            booking,
            convertedValue,
            aggregation: equityAggregation,
          });
        }

        if (bookingsPage.length < EQUITY_BOOKINGS_PAGE_SIZE) {
          break;
        }
      }

      const holdingAccountIds = holdingAccountsResolved.map(
        (account) => account.id,
      );

      if (holdingAccountIds.length > 0) {
        const initialHoldingBalances = await prisma.booking.groupBy({
          by: ["accountId"],
          where: {
            accountBookId: data.accountBookId,
            accountId: { in: holdingAccountIds },
            date: { lt: queryStart },
          },
          _sum: { value: true },
        });

        const initialHoldingBalanceByAccountId = new Map(
          initialHoldingBalances.map((balance) => [
            balance.accountId,
            Number(balance._sum.value ?? 0),
          ]),
        );

        const holdingGainLossState = await initializeHoldingGainLossState({
          holdingAccounts: holdingAccountsResolved,
          initialBalanceByAccountId: initialHoldingBalanceByAccountId,
          initialRateDate: initialHoldingDate,
          resolveRate: (input) =>
            getUnitToReferenceExchangeRate({
              ...input,
              referenceCurrency,
              exchangeRateByKey,
            }),
        });
        let nextTransactionIdCursor: string | undefined;

        while (true) {
          const transactionsPage = await prisma.transaction.findMany({
            where: {
              accountBookId: data.accountBookId,
              AND: [
                {
                  bookings: {
                    some: {
                      accountId: {
                        in: holdingAccountIds,
                      },
                      date: {
                        gte: queryStart,
                        lt: queryEndExclusive,
                      },
                    },
                  },
                },
                {
                  bookings: {
                    none: {
                      date: {
                        gte: queryEndExclusive,
                      },
                    },
                  },
                },
                {
                  bookings: {
                    none: {
                      account: {
                        type: AccountType.EQUITY,
                        equityAccountSubtype:
                          EquityAccountSubtype.OPENING_BALANCES,
                      },
                    },
                  },
                },
              ],
            },
            orderBy: { id: "asc" },
            take: TRANSACTIONS_PAGE_SIZE,
            ...(nextTransactionIdCursor
              ? {
                  cursor: {
                    id_accountBookId: {
                      id: nextTransactionIdCursor,
                      accountBookId: data.accountBookId,
                    },
                  },
                  skip: 1,
                }
              : {}),
            select: {
              id: true,
              bookings: {
                select: {
                  id: true,
                  accountId: true,
                  date: true,
                  value: true,
                  unit: true,
                  currency: true,
                  cryptocurrency: true,
                  symbol: true,
                  tradeCurrency: true,
                  account: {
                    select: {
                      type: true,
                      equityAccountSubtype: true,
                    },
                  },
                },
                orderBy: [{ date: "asc" }, { id: "asc" }],
              },
            },
          });

          if (transactionsPage.length === 0) {
            break;
          }

          nextTransactionIdCursor =
            transactionsPage[transactionsPage.length - 1].id;

          await applyHoldingTransactionsToGainLossState({
            state: holdingGainLossState,
            transactions: transactionsPage.map((transaction) => ({
              bookings: transaction.bookings.map((booking) => ({
                id: booking.id,
                accountId: booking.accountId,
                date: booking.date,
                value: Number(booking.value),
                unit: booking.unit,
                currency: booking.currency,
                cryptocurrency: booking.cryptocurrency,
                symbol: booking.symbol,
                tradeCurrency: booking.tradeCurrency,
                accountType: booking.account.type,
                equityAccountSubtype: booking.account.equityAccountSubtype,
              })),
            })),
            periodStart: queryStart,
            periodEndExclusive: queryEndExclusive,
            convertBookingToReference: ({ id: _id, ...booking }) =>
              convertBookingValueToReference({
                ...booking,
                referenceCurrency,
                exchangeRateByKey,
              }),
          });

          if (transactionsPage.length < TRANSACTIONS_PAGE_SIZE) {
            break;
          }
        }

        const holdingGainLossSplit = await finalizeHoldingGainLossState({
          state: holdingGainLossState,
          periodEnd: selection.to,
          resolveRate: (input) =>
            getUnitToReferenceExchangeRate({
              ...input,
              referenceCurrency,
              exchangeRateByKey,
            }),
        });

        realizedGainLoss += holdingGainLossSplit.realizedGainLoss;
        unrealizedGainLoss += holdingGainLossSplit.unrealizedGainLoss;
        convertedBookingsCount += holdingGainLossSplit.convertedCount;
        skippedBookingsCount += holdingGainLossSplit.skippedCount;
      }

      const transferClearingGainLossSplit =
        await computeTransferClearingGainLossSplit({
          unitBuckets: transferClearingUnitBuckets,
          periodStart: queryStart,
          periodEndExclusive: queryEndExclusive,
          initialRateDate: initialHoldingDate,
          periodEnd: selection.to,
          resolveRate: (input) =>
            getUnitToReferenceExchangeRate({
              ...input,
              referenceCurrency,
              exchangeRateByKey,
            }),
          convertBookingToReference: (booking) =>
            convertBookingValueToReference({
              value: booking.value,
              unit: booking.unit,
              currency: booking.currency,
              cryptocurrency: booking.cryptocurrency,
              symbol: booking.symbol,
              tradeCurrency: booking.tradeCurrency,
              date: booking.date,
              referenceCurrency,
              exchangeRateByKey,
            }),
        });
      realizedGainLoss += transferClearingGainLossSplit.realizedGainLoss;
      unrealizedGainLoss += transferClearingGainLossSplit.unrealizedGainLoss;
      convertedBookingsCount += transferClearingGainLossSplit.convertedCount;
      skippedBookingsCount += transferClearingGainLossSplit.skippedCount;
    }

    const endOfPeriodBalanceStats =
      await computeEndOfPeriodBalanceStatsWithConvertedBalances({
        accounts: assetLiabilityAccounts,
        rawBalanceByAccountId: endOfPeriodRawBalanceByAccountId,
        periodEnd: selection.to,
        referenceCurrency,
        convertBalanceToReference: async (input) =>
          convertBookingValueToReference({
            ...input,
            exchangeRateByKey,
          }),
      });
    skippedBookingsCount += endOfPeriodBalanceStats.skippedCount;

    const currentDay = startOfUtcDay(new Date());
    return buildPeriodOverviewResponse({
      selection,
      minPeriodDate,
      currentDay,
      referenceCurrency,
      groupById,
      assetLiabilityAccounts,
      equityAggregation,
      realizedGainLoss,
      unrealizedGainLoss,
      isBeforeAccountBookStart,
      endOfPeriodBalanceStats,
      bookingsCount,
      convertedBookingsCount,
      skippedBookingsCount,
    });
  });
