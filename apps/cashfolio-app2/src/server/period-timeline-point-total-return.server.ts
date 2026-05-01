import { AccountType, EquityAccountSubtype } from "../.prisma-client/enums";
import { prisma } from "../prisma.server";
import { round2 } from "./period-helpers";
import {
  convertBookingValueToReference,
  getUnitToReferenceExchangeRate,
} from "./period-conversion";
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
  computeTransferClearingGainLossSplit,
  loadTransferClearingUnitBuckets,
} from "./period-transfer-clearing";
import type { PeriodTimelinePointContext } from "./period-timeline-point-context.server";

const EQUITY_BOOKINGS_PAGE_SIZE = 1_000;
const TRANSACTIONS_PAGE_SIZE = 200;

export async function loadPeriodTimelinePointTotalReturn(args: {
  accountBookId: string;
  queryStart: Date;
  queryEndExclusive: Date;
  periodEnd: Date;
  initialHoldingDate: Date;
  context: PeriodTimelinePointContext;
  isBeforeAccountBookStart: boolean;
}) {
  const { referenceCurrency, holdingAccountsResolved } = args.context;
  const exchangeRateByKey = new Map<string, Promise<number | null>>();
  const equityAggregation = createPeriodOverviewEquityAggregation();
  let realizedGainLoss = 0;
  let unrealizedGainLoss = 0;

  if (!args.isBeforeAccountBookStart) {
    let nextBookingIdCursor: string | undefined;

    while (true) {
      const bookingsPage = await prisma.booking.findMany({
        where: {
          accountBookId: args.accountBookId,
          date: {
            gte: args.queryStart,
            lt: args.queryEndExclusive,
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
                  accountBookId: args.accountBookId,
                },
              },
              skip: 1,
            }
          : {}),
        select: {
          id: true,
          value: true,
          unit: true,
          currency: true,
          cryptocurrency: true,
          symbol: true,
          tradeCurrency: true,
          date: true,
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

      nextBookingIdCursor = bookingsPage[bookingsPage.length - 1]?.id;
      const convertedValues = await Promise.all(
        bookingsPage.map((booking) =>
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
      );

      for (let index = 0; index < bookingsPage.length; index += 1) {
        const booking = bookingsPage[index]!;
        const convertedValue = convertedValues[index];

        if (convertedValue == null) {
          continue;
        }

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
          accountBookId: args.accountBookId,
          accountId: { in: holdingAccountIds },
          date: { lt: args.queryStart },
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
        initialRateDate: args.initialHoldingDate,
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
            accountBookId: args.accountBookId,
            AND: [
              {
                bookings: {
                  some: {
                    accountId: {
                      in: holdingAccountIds,
                    },
                    date: {
                      gte: args.queryStart,
                      lt: args.queryEndExclusive,
                    },
                  },
                },
              },
              {
                bookings: {
                  none: {
                    date: {
                      gte: args.queryEndExclusive,
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
                    accountBookId: args.accountBookId,
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
          transactionsPage[transactionsPage.length - 1]?.id;

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
          periodStart: args.queryStart,
          periodEndExclusive: args.queryEndExclusive,
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
        periodEnd: args.periodEnd,
        resolveRate: (input) =>
          getUnitToReferenceExchangeRate({
            ...input,
            referenceCurrency,
            exchangeRateByKey,
          }),
      });

      realizedGainLoss += holdingGainLossSplit.realizedGainLoss;
      unrealizedGainLoss += holdingGainLossSplit.unrealizedGainLoss;
    }

    const transferClearingUnitBuckets = await loadTransferClearingUnitBuckets({
      accountBookId: args.accountBookId,
      periodEndExclusive: args.queryEndExclusive,
      referenceCurrency,
    });
    const transferClearingGainLossSplit =
      await computeTransferClearingGainLossSplit({
        unitBuckets: transferClearingUnitBuckets,
        periodStart: args.queryStart,
        periodEndExclusive: args.queryEndExclusive,
        initialRateDate: args.initialHoldingDate,
        periodEnd: args.periodEnd,
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
  }

  const { income, expenses, explicitGainLoss } = equityAggregation;
  const effectiveRealizedGainLoss = args.isBeforeAccountBookStart
    ? 0
    : explicitGainLoss + realizedGainLoss;
  const effectiveUnrealizedGainLoss = args.isBeforeAccountBookStart
    ? 0
    : unrealizedGainLoss;
  const gainsLosses = effectiveRealizedGainLoss + effectiveUnrealizedGainLoss;

  const roundedIncome = round2(income);
  const roundedExpenses = round2(expenses);
  const roundedGainsLosses = round2(gainsLosses);
  const roundedSavings = round2(roundedIncome - roundedExpenses);

  return round2(roundedSavings + roundedGainsLosses);
}
