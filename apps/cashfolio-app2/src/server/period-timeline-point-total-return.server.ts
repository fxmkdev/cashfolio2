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

export async function loadPeriodTimelinePointTotalReturn(args: {
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
    for (
      let startIndex = 0;
      startIndex < baseData.equityBookings.length;
      startIndex += EQUITY_CONVERSION_BATCH_SIZE
    ) {
      const batch = baseData.equityBookings.slice(
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
            referenceCurrency,
            exchangeRateByKey,
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
          aggregation: equityAggregation,
        });
      }
    }

    if (baseData.holdingAccountsResolved.length > 0) {
      const initialHoldingBalanceByAccountId = new Map(
        baseData.initialHoldingBalances.map((balance) => [
          balance.accountId,
          balance.rawBalance,
        ]),
      );

      const holdingGainLossState = await initializeHoldingGainLossState({
        holdingAccounts: baseData.holdingAccountsResolved,
        initialBalanceByAccountId: initialHoldingBalanceByAccountId,
        initialRateDate: selection.initialHoldingDate,
        resolveRate: (input) =>
          getUnitToReferenceExchangeRate({
            ...input,
            referenceCurrency,
            exchangeRateByKey,
          }),
      });

      await applyHoldingTransactionsToGainLossState({
        state: holdingGainLossState,
        transactions: baseData.holdingTransactions.map((transaction) => ({
          bookings: transaction.bookings,
        })),
        periodStart: selection.from,
        periodEndExclusive: selection.queryEndExclusive,
        convertBookingToReference: ({ id: _id, ...booking }) =>
          convertBookingValueToReference({
            ...booking,
            referenceCurrency,
            exchangeRateByKey,
          }),
      });

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
    }

    const transferClearingGainLossSplit =
      await computeTransferClearingGainLossSplit({
        unitBuckets: baseData.transferClearingUnitBuckets,
        periodStart: selection.from,
        periodEndExclusive: selection.queryEndExclusive,
        initialRateDate: selection.initialHoldingDate,
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

  return round2(roundedSavings + roundedGainsLosses);
}
