import {
  toMoney,
  type Money,
  moneyAdd,
  moneySubtract,
  moneyMultiply,
  moneyDivide,
  moneyAbs,
  moneyIsFinite,
} from "../../../shared/money";
import {
  applyExecutionToLots,
  isNearZero,
  toLotAcquisitionSortKey,
  QUANTITY_EPSILON,
} from "./period-overview-holdings-common";
import type {
  HoldingAccountState,
  HoldingExecutionLotMatch,
  HoldingGainLossFinalizationCallbacks,
  HoldingRateResolver,
} from "./period-overview-holdings-types";

/** Apply ordered executions to one account's FIFO lots, then value open lots. */
export async function finalizeHoldingAccountGainLoss(
  args: {
    state: HoldingAccountState;
    periodEnd: Date;
    resolveRate: HoldingRateResolver;
  } & Omit<HoldingGainLossFinalizationCallbacks, "onAccountGainLoss">,
) {
  let skippedCount = 0;
  let accountRealizedGainLoss: Money = toMoney(0);
  let accountUnrealizedGainLoss: Money = toMoney(0);

  args.state.executionEvents.sort((left, right) => {
    const dateDiff = left.date.getTime() - right.date.getTime();
    if (dateDiff !== 0) {
      return dateDiff;
    }
    return left.bookingId.localeCompare(right.bookingId, "en");
  });

  for (const event of args.state.executionEvents) {
    if (isNearZero(event.quantity)) {
      continue;
    }

    const executionUnitPriceInReference = moneyDivide(
      event.effectiveReferenceAmount,
      event.quantity,
    );
    if (!moneyIsFinite(executionUnitPriceInReference)) {
      skippedCount += 1;
      args.onSkippedItem?.({
        accountId: args.state.account.id,
        bookingId: event.bookingId,
        bookingDescription: event.bookingDescription,
        transactionDescription: event.transactionDescription,
        transactionId: event.transactionId ?? null,
        reason: "invalidExecutionPrice",
        date: event.date,
      });
      continue;
    }

    let lotMatches: HoldingExecutionLotMatch[] | undefined;
    const realizedGainLossDelta = applyExecutionToLots({
      lots: args.state.lots,
      quantity: event.quantity,
      executionUnitPriceInReference,
      acquisitionSortKey: toLotAcquisitionSortKey({
        date: event.date,
        bookingId: event.bookingId,
      }),
      ...(args.onAccountExecutionEvent
        ? {
            onLotMatched: (lotMatch: HoldingExecutionLotMatch) => {
              if (!lotMatches) {
                lotMatches = [];
              }
              lotMatches.push(lotMatch);
            },
          }
        : {}),
    });
    accountRealizedGainLoss = moneyAdd(
      accountRealizedGainLoss,
      realizedGainLossDelta,
    );
    args.onAccountExecutionEvent?.({
      accountId: args.state.account.id,
      bookingId: event.bookingId,
      bookingDescription: event.bookingDescription,
      transactionDescription: event.transactionDescription,
      transactionId: event.transactionId ?? null,
      date: event.date,
      quantity: event.quantity,
      pricingSource: event.pricingSource,
      marketReferenceAmount: event.marketReferenceAmount,
      residualAllocationAmount: event.residualAllocationAmount,
      effectiveReferenceAmount: event.effectiveReferenceAmount,
      executionUnitPriceInReference,
      realizedGainLossDelta,
      runningRealizedGainLoss: accountRealizedGainLoss,
      lotMatches: lotMatches ?? [],
    });
  }

  const openQuantity = args.state.lots.reduce(
    (sum, lot) => moneyAdd(sum, moneyAbs(lot.quantity)),
    toMoney(0),
  );
  if (toMoney(openQuantity).comparedTo(QUANTITY_EPSILON) > 0) {
    const periodEndRate = await args.resolveRate({
      unit: args.state.account.unit,
      currency: args.state.account.currency,
      cryptocurrency: args.state.account.cryptocurrency,
      symbol: args.state.account.symbol,
      tradeCurrency: args.state.account.tradeCurrency,
      date: args.periodEnd,
    });

    if (periodEndRate == null) {
      skippedCount += 1;
      args.onSkippedItem?.({
        accountId: args.state.account.id,
        reason: "missingPeriodEndRate",
        date: args.periodEnd,
      });
    } else {
      for (const lot of args.state.lots) {
        const lotUnrealizedGainLoss = moneyMultiply(
          lot.quantity,
          moneySubtract(periodEndRate, lot.unitCostInReference),
        );
        accountUnrealizedGainLoss = moneyAdd(
          accountUnrealizedGainLoss,
          lotUnrealizedGainLoss,
        );
        args.onAccountOpenLotValuation?.({
          accountId: args.state.account.id,
          acquisitionSortKey: lot.acquisitionSortKey,
          quantity: lot.quantity,
          unitCostInReference: lot.unitCostInReference,
          periodEndRate,
          unrealizedGainLoss: lotUnrealizedGainLoss,
        });
      }
    }
  }

  return {
    realizedGainLoss: accountRealizedGainLoss,
    unrealizedGainLoss: accountUnrealizedGainLoss,
    skippedCount,
  };
}
