import { createServerFn } from "@tanstack/react-start";
import { AccountType, EquityAccountSubtype } from "../.prisma-client/enums";
import { ensureAuthorizedForAccountBookId } from "../account-books/functions.server";
import { prisma } from "../prisma.server";
import {
  DEFAULT_PERIOD_VALUE,
  formatMonthPeriodValue,
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
  buildAvailableYears,
  buildBreakdownHierarchy,
  buildBreakdownHierarchyWithMeta,
  buildBreakdownItems,
  buildPeriodEndAllocationBreakdown,
  computeHoldingGainLossForEventSeries,
  createBreakdownBucket,
  filterConvertibleHoldingAccounts,
  getHoldingEventDateMap,
  isMultiUnitTransaction,
  round2,
  shouldIncludeTransactionForPeriod,
  sortHoldingEventsAscending,
  type BreakdownHierarchyAccumulatorItem,
  type HoldingGainLossSeriesEvent,
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

function addUtcDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
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
    const [allAccountGroups, assetLiabilityAccounts] = await Promise.all([
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
      assetLiabilityAccounts,
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

    const groupById = new Map(
      allAccountGroups.map((group) => [group.id, group]),
    );

    const exchangeRateByKey = new Map<string, Promise<number | null>>();
    const assetLiabilityAccountIds = assetLiabilityAccounts.map(
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

    let bookingsCount = 0;
    let convertedBookingsCount = 0;
    let skippedBookingsCount = 0;

    let income = 0;
    let expenses = 0;
    let explicitGainLoss = 0;

    const expenseAmountByAccountId = new Map<
      string,
      BreakdownHierarchyAccumulatorItem
    >();
    const incomeAmountByAccountId = new Map<
      string,
      BreakdownHierarchyAccumulatorItem
    >();

    let nextBookingIdCursor: string | undefined;
    let transactionGainLoss = 0;
    let holdingGainLoss = 0;

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

          if (
            booking.account.equityAccountSubtype === EquityAccountSubtype.INCOME
          ) {
            const incomeAmount = -convertedValue;
            income += incomeAmount;

            const existingItem = incomeAmountByAccountId.get(
              booking.account.id,
            );
            if (existingItem) {
              existingItem.amount += incomeAmount;
            } else {
              incomeAmountByAccountId.set(booking.account.id, {
                accountId: booking.account.id,
                accountName: booking.account.name,
                groupId: booking.account.groupId,
                amount: incomeAmount,
              });
            }
          } else if (
            booking.account.equityAccountSubtype ===
            EquityAccountSubtype.EXPENSE
          ) {
            const expenseAmount = convertedValue;
            expenses += expenseAmount;

            const existingItem = expenseAmountByAccountId.get(
              booking.account.id,
            );
            if (existingItem) {
              existingItem.amount += expenseAmount;
            } else {
              expenseAmountByAccountId.set(booking.account.id, {
                accountId: booking.account.id,
                accountName: booking.account.name,
                groupId: booking.account.groupId,
                amount: expenseAmount,
              });
            }
          } else {
            explicitGainLoss += -convertedValue;
          }
        }

        if (bookingsPage.length < EQUITY_BOOKINGS_PAGE_SIZE) {
          break;
        }
      }

      let nextTransactionIdCursor: string | undefined;

      while (true) {
        const transactionsPage = await prisma.transaction.findMany({
          where: {
            accountBookId: data.accountBookId,
            AND: [
              {
                bookings: {
                  some: {
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
                date: true,
                value: true,
                unit: true,
                currency: true,
                cryptocurrency: true,
                symbol: true,
                tradeCurrency: true,
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

        const multiUnitTransactions = transactionsPage.filter((transaction) =>
          isMultiUnitTransaction(transaction.bookings),
        );

        const convertedValuesPerTransaction = await Promise.all(
          multiUnitTransactions.map((transaction) =>
            Promise.all(
              transaction.bookings.map((booking) =>
                convertBookingValueToReference({
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
              ),
            ),
          ),
        );

        for (const convertedValues of convertedValuesPerTransaction) {
          const nonNullConvertedValues = convertedValues.filter(
            (convertedValue): convertedValue is number =>
              convertedValue != null,
          );
          const failedConversionsCount =
            convertedValues.length - nonNullConvertedValues.length;

          if (failedConversionsCount > 0) {
            skippedBookingsCount += failedConversionsCount;
            continue;
          }

          convertedBookingsCount += nonNullConvertedValues.length;
          transactionGainLoss += nonNullConvertedValues.reduce(
            (sum, convertedValue) => sum + convertedValue,
            0,
          );
        }

        if (transactionsPage.length < TRANSACTIONS_PAGE_SIZE) {
          break;
        }
      }

      const holdingAccountIds = holdingAccountsResolved.map(
        (account) => account.id,
      );

      if (holdingAccountIds.length > 0) {
        const [initialHoldingBalances, holdingBookingsInPeriod] =
          await Promise.all([
            prisma.booking.groupBy({
              by: ["accountId"],
              where: {
                accountBookId: data.accountBookId,
                accountId: { in: holdingAccountIds },
                date: { lt: queryStart },
              },
              _sum: { value: true },
            }),
            prisma.booking.findMany({
              where: {
                accountBookId: data.accountBookId,
                accountId: { in: holdingAccountIds },
                date: {
                  gte: queryStart,
                  lt: queryEndExclusive,
                },
              },
              orderBy: [{ accountId: "asc" }, { date: "asc" }, { id: "asc" }],
              select: {
                accountId: true,
                date: true,
                value: true,
              },
            }),
          ]);

        const initialHoldingBalanceByAccountId = new Map(
          initialHoldingBalances.map((balance) => [
            balance.accountId,
            Number(balance._sum.value ?? 0),
          ]),
        );

        const holdingBookingsByAccountId = new Map<
          string,
          Array<{ date: Date; value: number }>
        >();

        for (const booking of holdingBookingsInPeriod) {
          const existing = holdingBookingsByAccountId.get(booking.accountId);
          const normalizedBooking = {
            date: startOfUtcDay(booking.date),
            value: Number(booking.value),
          };

          if (existing) {
            existing.push(normalizedBooking);
          } else {
            holdingBookingsByAccountId.set(booking.accountId, [
              normalizedBooking,
            ]);
          }
        }

        const holdingResults = await Promise.all(
          holdingAccountsResolved.map(async (account) => {
            const initialBalance =
              initialHoldingBalanceByAccountId.get(account.id) ?? 0;
            const periodBookings =
              holdingBookingsByAccountId.get(account.id) ?? [];

            if (initialBalance === 0 && periodBookings.length === 0) {
              return { skippedCount: 0, gainLossContribution: 0 };
            }

            const initialRate = await getUnitToReferenceExchangeRate({
              unit: account.unit,
              currency: account.currency,
              cryptocurrency: account.cryptocurrency,
              symbol: account.symbol,
              tradeCurrency: account.tradeCurrency,
              date: initialHoldingDate,
              referenceCurrency,
              exchangeRateByKey,
            });

            if (initialRate == null) {
              return { skippedCount: 1, gainLossContribution: 0 };
            }

            const holdingEventDateMap = getHoldingEventDateMap({
              bookings: periodBookings,
              periodEnd: selection.to,
            });

            const sortedEvents = sortHoldingEventsAscending(
              Array.from(holdingEventDateMap.values()),
            );

            const eventRatePromises = sortedEvents.map((event) =>
              getUnitToReferenceExchangeRate({
                unit: account.unit,
                currency: account.currency,
                cryptocurrency: account.cryptocurrency,
                symbol: account.symbol,
                tradeCurrency: account.tradeCurrency,
                date: event.date,
                referenceCurrency,
                exchangeRateByKey,
              }),
            );
            const eventRates = await Promise.all(eventRatePromises);
            const nonNullEventRates = eventRates.filter(
              (eventRate): eventRate is number => eventRate != null,
            );

            if (nonNullEventRates.length !== eventRates.length) {
              return { skippedCount: 1, gainLossContribution: 0 };
            }

            const eventsForSeries: HoldingGainLossSeriesEvent[] =
              sortedEvents.map((event, index) => ({
                rate: nonNullEventRates[index]!,
                balanceDelta: event.balanceDelta,
              }));

            return {
              skippedCount: 0,
              gainLossContribution: computeHoldingGainLossForEventSeries({
                initialBalance,
                initialRate,
                events: eventsForSeries,
              }),
            };
          }),
        );

        holdingGainLoss += holdingResults.reduce(
          (sum, result) => sum + result.gainLossContribution,
          0,
        );
        skippedBookingsCount += holdingResults.reduce(
          (sum, result) => sum + result.skippedCount,
          0,
        );
      }
    }

    const gainsLosses = isBeforeAccountBookStart
      ? 0
      : explicitGainLoss + transactionGainLoss + holdingGainLoss;

    const roundedIncome = round2(income);
    const roundedExpenses = round2(expenses);
    const roundedGainsLosses = round2(gainsLosses);
    const roundedSavings = round2(roundedIncome - roundedExpenses);
    const roundedTotalReturn = round2(roundedSavings + roundedGainsLosses);
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

    const roundedEndOfPeriodAssets = round2(endOfPeriodBalanceStats.assets);
    const roundedEndOfPeriodLiabilities = round2(
      endOfPeriodBalanceStats.liabilities,
    );
    const roundedEndOfPeriodNetWorth = round2(endOfPeriodBalanceStats.netWorth);

    const convertedPeriodEndBalances = assetLiabilityAccounts.map(
      (account) => ({
        accountId: account.id,
        accountName: account.name,
        groupId: account.groupId,
        accountType: account.type,
        convertedBalanceInReferenceCurrency:
          endOfPeriodBalanceStats.convertedBalanceByAccountId.get(account.id) ??
          null,
      }),
    );
    const assetBreakdown = buildPeriodEndAllocationBreakdown({
      items: convertedPeriodEndBalances.filter(
        (
          item,
        ): item is (typeof convertedPeriodEndBalances)[number] & {
          accountType: "ASSET";
        } => item.accountType === AccountType.ASSET,
      ),
      groupById,
    });
    const liabilityBreakdown = buildPeriodEndAllocationBreakdown({
      items: convertedPeriodEndBalances.filter(
        (
          item,
        ): item is (typeof convertedPeriodEndBalances)[number] & {
          accountType: "LIABILITY";
        } => item.accountType === AccountType.LIABILITY,
      ),
      groupById,
    });

    const {
      hierarchy: expenseBreakdownHierarchy,
      hasHiddenAmountDiscrepancy: expenseBreakdownHasHiddenAmountDiscrepancy,
      hiddenAmountDiscrepancyNodeIds: expenseBreakdownDiscrepancyNodeIds,
    } = buildBreakdownHierarchyWithMeta({
      items: Array.from(expenseAmountByAccountId.values()),
      groupById,
    });
    const {
      hierarchy: incomeBreakdownHierarchy,
      hasHiddenAmountDiscrepancy: incomeBreakdownHasHiddenAmountDiscrepancy,
      hiddenAmountDiscrepancyNodeIds: incomeBreakdownDiscrepancyNodeIds,
    } = buildBreakdownHierarchyWithMeta({
      items: Array.from(incomeAmountByAccountId.values()),
      groupById,
    });
    const expenseBreakdown = buildBreakdownItems(
      expenseBreakdownHierarchy.map((node) => ({
        id: node.id,
        label: node.label,
        kind: node.kind,
        amount: node.amount,
      })),
    );
    const incomeBreakdown = buildBreakdownItems(
      incomeBreakdownHierarchy.map((node) => ({
        id: node.id,
        label: node.label,
        kind: node.kind,
        amount: node.amount,
      })),
    );

    const currentDay = startOfUtcDay(new Date());
    const availableYears = buildAvailableYears({
      firstBookingDate: minPeriodDate,
      now: currentDay,
    });

    return {
      selectedPeriodValue: selection.periodValue,
      selectedPeriodSpecifier: selection.periodSpecifier,
      selectedPeriodLabel: selection.label,
      selectedGranularity: selection.granularity,
      selectedYear: selection.year,
      selectedMonth: selection.month,
      periodDateRange: {
        from: selection.from.toISOString(),
        to: selection.to.toISOString(),
      },
      minBookingDate: minPeriodDate.toISOString(),
      maxDate: currentDay.toISOString(),
      availableYears,
      currentMonthValue: formatMonthPeriodValue(
        currentDay.getUTCFullYear(),
        currentDay.getUTCMonth(),
      ),
      currentYearValue: String(currentDay.getUTCFullYear()),
      referenceCurrency,
      bookingsCount,
      convertedBookingsCount,
      skippedBookingsCount,
      stats: {
        totalReturn: roundedTotalReturn,
        savings: roundedSavings,
        income: roundedIncome,
        expenses: roundedExpenses,
        gainsLosses: roundedGainsLosses,
        endOfPeriodNetWorth: roundedEndOfPeriodNetWorth,
        endOfPeriodAssets: roundedEndOfPeriodAssets,
        endOfPeriodLiabilities: roundedEndOfPeriodLiabilities,
        explicitGainLoss: round2(explicitGainLoss),
        transactionGainLoss: round2(transactionGainLoss),
        holdingGainLoss: round2(holdingGainLoss),
      },
      expenseBreakdown: {
        totalAmount: expenseBreakdown.totalAmount,
        items: expenseBreakdown.items,
        hierarchy: expenseBreakdownHierarchy,
        hasHiddenAmountDiscrepancy: expenseBreakdownHasHiddenAmountDiscrepancy,
        hiddenAmountDiscrepancyNodeIds: expenseBreakdownDiscrepancyNodeIds,
      },
      incomeBreakdown: {
        totalAmount: incomeBreakdown.totalAmount,
        items: incomeBreakdown.items,
        hierarchy: incomeBreakdownHierarchy,
        hasHiddenAmountDiscrepancy: incomeBreakdownHasHiddenAmountDiscrepancy,
        hiddenAmountDiscrepancyNodeIds: incomeBreakdownDiscrepancyNodeIds,
      },
      assetBreakdown,
      liabilityBreakdown,
    };
  });
