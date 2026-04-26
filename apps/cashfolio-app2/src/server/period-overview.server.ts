import { AccountType, EquityAccountSubtype } from "../.prisma-client/enums";
import { prisma } from "../prisma.server";
import { normalizePeriodValue } from "../shared/period";
import { startOfUtcDay } from "../shared/date";
import {
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
} from "./period-selection";
import { computeEndOfPeriodBalanceStatsWithConvertedBalances } from "./period-balance-stats";
import {
  accumulateConvertedEquityBooking,
  createPeriodOverviewEquityAggregation,
} from "./period-overview-aggregation";
import {
  accumulateGainLossContribution,
  resolveExplicitCounterpartNonEquityAccounts,
  type ExplicitCounterpartAccount,
  type GainLossContributionAccumulator,
} from "./period-gains-losses-contributions";
import {
  applyHoldingTransactionsToGainLossState,
  finalizeHoldingGainLossState,
  initializeHoldingGainLossState,
} from "./period-overview-holdings";
import {
  buildTransferClearingVirtualHierarchy,
  computeTransferClearingGainLossSplit,
  loadTransferClearingUnitBuckets,
} from "./period-transfer-clearing";
import { buildPeriodOverviewResponse } from "./period-overview-response";

const EQUITY_BOOKINGS_PAGE_SIZE = 1_000;
const TRANSACTIONS_PAGE_SIZE = 200;

function addUtcDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export async function loadPeriodOverview(args: {
  accountBookId: string;
  period?: unknown;
}) {
  const data = {
    accountBookId: args.accountBookId,
    period: normalizePeriodValue(args.period),
  };

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
  const assetLiabilityAccountNameById = new Map(
    baseAssetLiabilityAccounts.map((account) => [account.id, account.name]),
  );

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
  const transferClearingUnitBuckets = await loadTransferClearingUnitBuckets({
    accountBookId: data.accountBookId,
    periodEndExclusive: queryEndExclusive,
    referenceCurrency,
  });
  const {
    virtualGroups: transferClearingVirtualGroups,
    virtualAccounts: transferClearingVirtualAccounts,
    rawBalanceByVirtualAccountId,
  } = buildTransferClearingVirtualHierarchy({
    unitBuckets: transferClearingUnitBuckets,
  });

  const groupById = new Map(allAccountGroups.map((group) => [group.id, group]));
  for (const virtualGroup of transferClearingVirtualGroups) {
    groupById.set(virtualGroup.id, virtualGroup);
  }

  const assetLiabilityAccounts = [
    ...baseAssetLiabilityAccounts,
    ...transferClearingVirtualAccounts,
  ];
  for (const virtualAccount of transferClearingVirtualAccounts) {
    assetLiabilityAccountNameById.set(virtualAccount.id, virtualAccount.name);
  }
  // Intentionally keep posted real-account balances: virtual transfer-clearing
  // accounts represent the missing counterpart leg with opposite sign.
  for (const [accountId, rawBalance] of rawBalanceByVirtualAccountId) {
    endOfPeriodRawBalanceByAccountId.set(accountId, rawBalance);
  }

  let bookingsCount = 0;
  let convertedBookingsCount = 0;
  let skippedBookingsCount = 0;

  const equityAggregation = createPeriodOverviewEquityAggregation();
  const gainsLossesContributionByKey = new Map<
    string,
    GainLossContributionAccumulator
  >();
  const explicitCounterpartAccountByTransactionId = new Map<
    string,
    ExplicitCounterpartAccount
  >();

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
          transactionId: true,
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
      const explicitBookingsForCounterpartResolution: Array<{
        transactionId: string;
      }> = [];
      for (let index = 0; index < conversionTasks.length; index += 1) {
        const booking = conversionTasks[index]!.booking;
        const convertedValue = convertedValues[index];
        if (
          convertedValue != null &&
          booking.account.equityAccountSubtype ===
            EquityAccountSubtype.GAIN_LOSS
        ) {
          explicitBookingsForCounterpartResolution.push({
            transactionId: booking.transactionId,
          });
        }
      }
      if (explicitBookingsForCounterpartResolution.length > 0) {
        await resolveExplicitCounterpartNonEquityAccounts({
          accountBookId: data.accountBookId,
          explicitBookings: explicitBookingsForCounterpartResolution,
          byTransactionId: explicitCounterpartAccountByTransactionId,
        });
      }

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

        if (
          booking.account.equityAccountSubtype ===
          EquityAccountSubtype.GAIN_LOSS
        ) {
          const counterpartAccount =
            explicitCounterpartAccountByTransactionId.get(
              booking.transactionId,
            );
          if (!counterpartAccount) {
            throw new Error(
              `Explicit gain/loss booking invariant violated for booking ${booking.id} in transaction ${booking.transactionId}: missing resolved counterpart account.`,
            );
          }

          accumulateGainLossContribution({
            byKey: gainsLossesContributionByKey,
            sourceKind: "EXPLICIT",
            accountId: counterpartAccount.id,
            accountName: counterpartAccount.name,
            unit: booking.unit,
            currency: booking.currency,
            cryptocurrency: booking.cryptocurrency,
            symbol: booking.symbol,
            tradeCurrency: booking.tradeCurrency,
            realizedGainLoss: -convertedValue,
            unrealizedGainLoss: 0,
          });
        }
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
        onAccountGainLoss: (gainLossByAccount) => {
          accumulateGainLossContribution({
            byKey: gainsLossesContributionByKey,
            sourceKind: "HOLDING",
            accountId: gainLossByAccount.accountId,
            accountName:
              assetLiabilityAccountNameById.get(gainLossByAccount.accountId) ??
              "Unknown account",
            unit: gainLossByAccount.unit,
            currency: gainLossByAccount.currency,
            cryptocurrency: gainLossByAccount.cryptocurrency,
            symbol: gainLossByAccount.symbol,
            tradeCurrency: gainLossByAccount.tradeCurrency,
            realizedGainLoss: gainLossByAccount.realizedGainLoss,
            unrealizedGainLoss: gainLossByAccount.unrealizedGainLoss,
          });
        },
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
        onUnitGainLoss: (gainLossByUnit) => {
          const transferClearingAccountId = `virtual:transfer-clearing:account:${gainLossByUnit.unitKey}`;
          accumulateGainLossContribution({
            byKey: gainsLossesContributionByKey,
            sourceKind: "HOLDING",
            accountId: transferClearingAccountId,
            accountName:
              assetLiabilityAccountNameById.get(transferClearingAccountId) ??
              gainLossByUnit.unitLabel,
            unit: gainLossByUnit.unit,
            currency: gainLossByUnit.currency,
            cryptocurrency: gainLossByUnit.cryptocurrency,
            symbol: gainLossByUnit.symbol,
            tradeCurrency: gainLossByUnit.tradeCurrency,
            realizedGainLoss: gainLossByUnit.realizedGainLoss,
            unrealizedGainLoss: gainLossByUnit.unrealizedGainLoss,
          });
        },
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
    gainsLossesContributions: Array.from(gainsLossesContributionByKey.values()),
  });
}
