import { createServerFn } from "@tanstack/react-start";
import { AccountType, EquityAccountSubtype } from "../.prisma-client/enums";
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
  summarizeMultiUnitTransactionConvertedValues,
} from "./period-overview-aggregation";
import { computeHoldingAccountGainLoss } from "./period-overview-holdings";
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

    const equityAggregation = createPeriodOverviewEquityAggregation();

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
          const transactionContribution =
            summarizeMultiUnitTransactionConvertedValues(convertedValues);
          skippedBookingsCount += transactionContribution.skippedCount;
          convertedBookingsCount += transactionContribution.convertedCount;
          transactionGainLoss += transactionContribution.gainLossContribution;
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
            return computeHoldingAccountGainLoss({
              account,
              initialBalance,
              periodBookings,
              initialRateDate: initialHoldingDate,
              periodEnd: selection.to,
              resolveRate: (input) =>
                getUnitToReferenceExchangeRate({
                  ...input,
                  referenceCurrency,
                  exchangeRateByKey,
                }),
            });
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
      transactionGainLoss,
      holdingGainLoss,
      isBeforeAccountBookStart,
      endOfPeriodBalanceStats,
      bookingsCount,
      convertedBookingsCount,
      skippedBookingsCount,
    });
  });
