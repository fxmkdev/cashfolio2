import type {
  GainLossReconciliationOpenLot,
  GainLossReconciliationRealizedEvent,
  GainLossReconciliationRealizedEventLotMatch,
} from "../../shared/gain-loss-reconciliation";
import {
  moneyAdd,
  moneyRound2 as round2,
  toMoney,
  type Money,
} from "../../shared/money";
import type {
  HoldingExecutionExplainInput,
  HoldingOpenLotExplainInput,
} from "./types";

export function parseAcquisitionSortKey(sortKey: string): {
  acquisitionDate: string;
  acquisitionBookingId: string;
} {
  const separatorIndex = sortKey.indexOf("::");
  if (separatorIndex < 0) {
    return {
      acquisitionDate: new Date(0).toISOString(),
      acquisitionBookingId: sortKey,
    };
  }

  const datePart = sortKey.slice(0, separatorIndex);
  const bookingId = sortKey.slice(separatorIndex + 2).split("::")[0]!;
  const acquisitionDate = new Date(datePart);
  return {
    acquisitionDate: Number.isFinite(acquisitionDate.getTime())
      ? acquisitionDate.toISOString()
      : new Date(0).toISOString(),
    acquisitionBookingId: bookingId,
  };
}

function toRealizedEventLotMatches(args: {
  roundAmounts?: boolean;
  bookingId: string;
  lotMatches: Array<{
    acquisitionSortKey: string;
    matchedQuantity: Money;
    lotUnitCostInReference: Money;
    executionUnitPriceInReference: Money;
    realizedGainLossDelta: Money;
    runningEventRealizedGainLoss: Money;
  }>;
}): GainLossReconciliationRealizedEventLotMatch<Money>[] {
  const round = args.roundAmounts === false ? toMoney : round2;
  return args.lotMatches.map((lotMatch, index) => {
    const parsed = parseAcquisitionSortKey(lotMatch.acquisitionSortKey);
    return {
      id: `match:${args.bookingId}:${index + 1}`,
      acquisitionSortKey: lotMatch.acquisitionSortKey,
      acquisitionDate: parsed.acquisitionDate,
      acquisitionBookingId: parsed.acquisitionBookingId,
      matchedQuantity: round(lotMatch.matchedQuantity),
      lotUnitCostInReference: round(lotMatch.lotUnitCostInReference),
      executionUnitPriceInReference: round(
        lotMatch.executionUnitPriceInReference,
      ),
      realizedGainLossDelta: round(lotMatch.realizedGainLossDelta),
      runningEventRealizedGainLoss: round(
        lotMatch.runningEventRealizedGainLoss,
      ),
    };
  });
}

export function toRoundedRealizedEvent(
  event: HoldingExecutionExplainInput,
  roundAmounts = true,
): GainLossReconciliationRealizedEvent<Money> {
  const round = roundAmounts ? round2 : toMoney;
  const roundedEffectiveReferenceAmount = round(event.effectiveReferenceAmount);
  const roundedExecutionUnitPriceInReference = round(
    event.executionUnitPriceInReference,
  );
  const roundedRealizedGainLossDelta = round(event.realizedGainLossDelta);
  const roundedRunningRealizedGainLoss = round(event.runningRealizedGainLoss);

  return {
    id: `event:${event.bookingId}${event.portion === "transfer-fallback" ? ":transfer-fallback" : event.pricingSource === "transferBasis" ? ":transfer" : ""}`,
    date: event.date.toISOString(),
    bookingId: event.bookingId,
    bookingDescription: event.bookingDescription ?? null,
    transactionId: event.transactionId,
    transactionDescription: event.transactionDescription ?? null,
    quantity: event.quantity,
    effectiveReferenceAmount: roundedEffectiveReferenceAmount,
    executionUnitPriceInReference: roundedExecutionUnitPriceInReference,
    realizedGainLossDelta: roundedRealizedGainLossDelta,
    runningRealizedGainLoss: roundedRunningRealizedGainLoss,
    lotMatches: toRealizedEventLotMatches({
      roundAmounts,
      bookingId: event.bookingId,
      lotMatches: event.lotMatches,
    }),
    pricing: {
      source: event.pricingSource,
      marketReferenceAmount:
        event.marketReferenceAmount == null
          ? null
          : round(event.marketReferenceAmount),
      residualAllocationAmount: round(event.residualAllocationAmount),
      effectiveReferenceAmount: roundedEffectiveReferenceAmount,
    },
    rounding: {
      rawEffectiveReferenceAmount: event.effectiveReferenceAmount,
      roundedEffectiveReferenceAmount,
      rawExecutionUnitPriceInReference: event.executionUnitPriceInReference,
      roundedExecutionUnitPriceInReference,
      rawRealizedGainLossDelta: event.realizedGainLossDelta,
      roundedRealizedGainLossDelta,
      rawRunningRealizedGainLoss: event.runningRealizedGainLoss,
      roundedRunningRealizedGainLoss,
    },
  };
}

export function toRoundedOpenLot(
  lot: HoldingOpenLotExplainInput,
  roundAmounts = true,
): GainLossReconciliationOpenLot<Money> {
  const round = roundAmounts ? round2 : toMoney;
  const parsed = parseAcquisitionSortKey(lot.acquisitionSortKey);
  return {
    id: `lot:${lot.acquisitionSortKey}`,
    acquisitionSortKey: lot.acquisitionSortKey,
    acquisitionDate: parsed.acquisitionDate,
    acquisitionBookingId: parsed.acquisitionBookingId,
    quantity: lot.quantity,
    unitCostInReference: round(lot.unitCostInReference),
    periodEndRate: round(lot.periodEndRate),
    unrealizedGainLoss: round(lot.unrealizedGainLoss),
    runningUnrealizedGainLoss: toMoney(0),
  };
}

export function addRunningUnrealizedGainLoss(
  openLots: GainLossReconciliationOpenLot<Money>[],
  roundAmounts = true,
): GainLossReconciliationOpenLot<Money>[] {
  const round = roundAmounts ? round2 : toMoney;
  const sortedOpenLots = [...openLots].sort((left, right) =>
    left.acquisitionSortKey.localeCompare(right.acquisitionSortKey, "en"),
  );
  let runningUnrealizedGainLoss: Money = toMoney(0);

  return sortedOpenLots.map((openLot) => {
    runningUnrealizedGainLoss = round(
      moneyAdd(runningUnrealizedGainLoss, openLot.unrealizedGainLoss),
    );
    return {
      ...openLot,
      runningUnrealizedGainLoss,
    };
  });
}
