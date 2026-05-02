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
  getOrLoadPeriodBaseData,
  type PeriodBaseData,
} from "./period-base-data-cache";
import { computeTransferClearingGainLossSplit } from "./period-transfer-clearing";

const EQUITY_CONVERSION_BATCH_SIZE = 500;

export type PeriodTimelinePointMetrics = {
  totalReturn: number;
  savings: number;
  income: number;
  expenses: number;
  gainsLosses: number;
};

async function accumulateEquityMetrics(args: {
  baseData: PeriodBaseData;
  referenceCurrency: string;
  exchangeRateByKey: Map<string, Promise<number | null>>;
  aggregation: ReturnType<typeof createPeriodOverviewEquityAggregation>;
}) {
  for (
    let startIndex = 0;
    startIndex < args.baseData.equityBookings.length;
    startIndex += EQUITY_CONVERSION_BATCH_SIZE
  ) {
    const batch = args.baseData.equityBookings.slice(
      startIndex,
      startIndex + EQUITY_CONVERSION_BATCH_SIZE,
    );

    const convertedValues = await Promise.all(
      batch.map((booking) =>
        convertBookingValueToReference({
          value: booking.value,
          unit: booking.unit,
          currency: booking.currency,
          cryptocurrency: booking.cryptocurrency,
          symbol: booking.symbol,
          tradeCurrency: booking.tradeCurrency,
          date: booking.date,
          referenceCurrency: args.referenceCurrency,
          exchangeRateByKey: args.exchangeRateByKey,
        }),
      ),
    );

    for (let index = 0; index < batch.length; index += 1) {
      const booking = batch[index]!;
      const convertedValue = convertedValues[index];
      if (convertedValue == null) {
        continue;
      }

      accumulateConvertedEquityBooking({
        booking: {
          account: {
            id: booking.accountId,
            name: booking.accountName,
            groupId: booking.accountGroupId,
            equityAccountSubtype: booking.equityAccountSubtype,
          },
        },
        convertedValue,
        aggregation: args.aggregation,
      });
    }
  }
}

async function loadHoldingGainLossSplit(args: {
  baseData: PeriodBaseData;
  referenceCurrency: string;
  exchangeRateByKey: Map<string, Promise<number | null>>;
}) {
  if (args.baseData.holdingAccountsResolved.length === 0) {
    return {
      realizedGainLoss: 0,
      unrealizedGainLoss: 0,
    };
  }

  const selection = args.baseData.selection;
  const initialHoldingBalanceByAccountId = new Map(
    args.baseData.initialHoldingBalances.map((balance) => [
      balance.accountId,
      balance.rawBalance,
    ]),
  );

  const holdingGainLossState = await initializeHoldingGainLossState({
    holdingAccounts: args.baseData.holdingAccountsResolved,
    initialBalanceByAccountId: initialHoldingBalanceByAccountId,
    initialRateDate: selection.initialHoldingDate,
    resolveRate: (input) =>
      getUnitToReferenceExchangeRate({
        ...input,
        referenceCurrency: args.referenceCurrency,
        exchangeRateByKey: args.exchangeRateByKey,
      }),
  });

  await applyHoldingTransactionsToGainLossState({
    state: holdingGainLossState,
    transactions: args.baseData.holdingTransactions.map((transaction) => ({
      bookings: transaction.bookings,
    })),
    periodStart: selection.from,
    periodEndExclusive: selection.queryEndExclusive,
    convertBookingToReference: ({ id: _id, ...booking }) =>
      convertBookingValueToReference({
        ...booking,
        referenceCurrency: args.referenceCurrency,
        exchangeRateByKey: args.exchangeRateByKey,
      }),
  });

  return finalizeHoldingGainLossState({
    state: holdingGainLossState,
    periodEnd: selection.to,
    resolveRate: (input) =>
      getUnitToReferenceExchangeRate({
        ...input,
        referenceCurrency: args.referenceCurrency,
        exchangeRateByKey: args.exchangeRateByKey,
      }),
  });
}

async function loadTransferClearingGainLossSplit(args: {
  baseData: PeriodBaseData;
  referenceCurrency: string;
  exchangeRateByKey: Map<string, Promise<number | null>>;
}) {
  const selection = args.baseData.selection;
  return computeTransferClearingGainLossSplit({
    unitBuckets: args.baseData.transferClearingUnitBuckets,
    periodStart: selection.from,
    periodEndExclusive: selection.queryEndExclusive,
    initialRateDate: selection.initialHoldingDate,
    periodEnd: selection.to,
    resolveRate: (input) =>
      getUnitToReferenceExchangeRate({
        ...input,
        referenceCurrency: args.referenceCurrency,
        exchangeRateByKey: args.exchangeRateByKey,
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
        referenceCurrency: args.referenceCurrency,
        exchangeRateByKey: args.exchangeRateByKey,
      }),
  });
}

export async function loadPeriodTimelinePointMetrics(args: {
  accountBookId: string;
  period?: unknown;
  baseData?: PeriodBaseData;
}) {
  const baseData =
    args.baseData ??
    (await getOrLoadPeriodBaseData({
      accountBookId: args.accountBookId,
      period: args.period,
    }));

  const referenceCurrency = baseData.referenceCurrency;
  const selection = baseData.selection;
  const exchangeRateByKey = new Map<string, Promise<number | null>>();
  const equityAggregation = createPeriodOverviewEquityAggregation();
  let realizedGainLoss = 0;
  let unrealizedGainLoss = 0;

  if (!selection.isBeforeAccountBookStart) {
    await accumulateEquityMetrics({
      baseData,
      referenceCurrency,
      exchangeRateByKey,
      aggregation: equityAggregation,
    });

    const holdingGainLossSplit = await loadHoldingGainLossSplit({
      baseData,
      referenceCurrency,
      exchangeRateByKey,
    });
    realizedGainLoss += holdingGainLossSplit.realizedGainLoss;
    unrealizedGainLoss += holdingGainLossSplit.unrealizedGainLoss;

    const transferClearingGainLossSplit =
      await loadTransferClearingGainLossSplit({
        baseData,
        referenceCurrency,
        exchangeRateByKey,
      });
    realizedGainLoss += transferClearingGainLossSplit.realizedGainLoss;
    unrealizedGainLoss += transferClearingGainLossSplit.unrealizedGainLoss;
  }

  const { income, expenses, explicitGainLoss } = equityAggregation;
  const effectiveRealizedGainLoss = selection.isBeforeAccountBookStart
    ? 0
    : explicitGainLoss + realizedGainLoss;
  const effectiveUnrealizedGainLoss = selection.isBeforeAccountBookStart
    ? 0
    : unrealizedGainLoss;
  const gainsLosses = effectiveRealizedGainLoss + effectiveUnrealizedGainLoss;

  const roundedIncome = round2(income);
  const roundedExpenses = round2(expenses);
  const roundedGainsLosses = round2(gainsLosses);
  const roundedSavings = round2(roundedIncome - roundedExpenses);
  const roundedTotalReturn = round2(roundedSavings + roundedGainsLosses);

  return {
    totalReturn: roundedTotalReturn,
    savings: roundedSavings,
    income: roundedIncome,
    expenses: roundedExpenses,
    gainsLosses: roundedGainsLosses,
  } satisfies PeriodTimelinePointMetrics;
}
