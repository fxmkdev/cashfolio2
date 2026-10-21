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
  HoldingExecutionEvent,
  HoldingGainLossFinalizationCallbacks,
  HoldingRateResolver,
} from "./period-overview-holdings-types";

/** Apply one priced execution to FIFO lots without requesting a closing valuation. */
export function applyHoldingAccountExecution(
  args: {
    state: HoldingAccountState;
    event: HoldingExecutionEvent;
  } & Pick<
    HoldingGainLossFinalizationCallbacks,
    "onAccountExecutionEvent" | "onSkippedItem"
  >,
): number {
  const { event } = args;
  if (isNearZero(event.quantity)) {
    return 0;
  }

  const executionUnitPriceInReference = moneyDivide(
    event.effectiveReferenceAmount,
    event.quantity,
  );
  if (!moneyIsFinite(executionUnitPriceInReference)) {
    args.onSkippedItem?.({
      accountId: args.state.account.id,
      bookingId: event.bookingId,
      bookingDescription: event.bookingDescription,
      transactionDescription: event.transactionDescription,
      transactionId: event.transactionId ?? null,
      reason: "invalidExecutionPrice",
      date: event.date,
    });
    return 1;
  }

  let lotMatches: HoldingExecutionLotMatch[] | undefined;
  const realizedGainLossDelta = applyExecutionToLots({
    lots: args.state.lots,
    quantity: event.quantity,
    executionUnitPriceInReference,
    acquisitionSortKey: toLotAcquisitionSortKey({
      date: event.date,
      bookingId: event.bookingId,
      portion: event.portion,
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
  args.state.realizedGainLoss = moneyAdd(
    args.state.realizedGainLoss ?? toMoney(0),
    realizedGainLossDelta,
  );
  args.onAccountExecutionEvent?.({
    ...(event.portion ? { portion: event.portion } : {}),
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
    runningRealizedGainLoss: args.state.realizedGainLoss,
    lotMatches: lotMatches ?? [],
  });
  return 0;
}

export function hasOpenHoldingLots(state: HoldingAccountState): boolean {
  const openQuantity = state.lots.reduce(
    (sum, lot) => moneyAdd(sum, moneyAbs(lot.quantity)),
    toMoney(0),
  );
  return openQuantity.comparedTo(QUANTITY_EPSILON) > 0;
}

/** Apply ordered executions to one account's FIFO lots, then value open lots. */
export async function finalizeHoldingAccountGainLoss(
  args: {
    state: HoldingAccountState;
    periodEnd: Date;
    resolveRate: HoldingRateResolver;
  } & Omit<HoldingGainLossFinalizationCallbacks, "onAccountGainLoss">,
) {
  let skippedCount = 0;
  let accountUnrealizedGainLoss: Money = toMoney(0);

  args.state.executionEvents.sort((left, right) => {
    const dateDiff = left.date.getTime() - right.date.getTime();
    if (dateDiff !== 0) {
      return dateDiff;
    }
    return left.bookingId.localeCompare(right.bookingId, "en");
  });

  const processedEvents = args.state.processedExecutionEvents ?? [];
  for (const event of args.state.executionEvents) {
    skippedCount += applyHoldingAccountExecution({
      ...args,
      event,
      onAccountExecutionEvent: args.onAccountExecutionEvent
        ? (processed) => processedEvents.push(processed)
        : undefined,
    });
  }
  args.state.executionEvents = [];
  processedEvents.sort((left, right) => {
    const dateDiff = left.date.getTime() - right.date.getTime();
    return dateDiff || left.bookingId.localeCompare(right.bookingId, "en");
  });
  let runningRealizedGainLoss = toMoney(0);
  for (const event of processedEvents) {
    runningRealizedGainLoss = moneyAdd(
      runningRealizedGainLoss,
      event.realizedGainLossDelta,
    );
    args.onAccountExecutionEvent?.({ ...event, runningRealizedGainLoss });
  }
  args.state.processedExecutionEvents = [];

  if (hasOpenHoldingLots(args.state)) {
    const periodEndRate = await args.resolveRate({
      unit: args.state.account.unit,
      currency: args.state.account.currency,
      cryptocurrency: args.state.account.cryptocurrency,
      symbol: args.state.account.symbol,
      tradeCurrency: args.state.account.tradeCurrency,
      date: args.periodEnd,
    });

    if (periodEndRate == null) {
      for (const lot of args.state.lots)
        args.onAccountUnvaluedOpenLot?.({
          accountId: args.state.account.id,
          ...lot,
        });
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
    realizedGainLoss: args.state.realizedGainLoss ?? toMoney(0),
    unrealizedGainLoss: accountUnrealizedGainLoss,
    skippedCount,
  };
}
