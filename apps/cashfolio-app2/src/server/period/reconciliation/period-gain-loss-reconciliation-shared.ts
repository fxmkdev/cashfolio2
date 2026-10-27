import { toMoney, type Money, moneyAdd } from "../../../shared/money";
import { round2 } from "../period-helpers";
import type {
  GainLossReconciliationDiagnostic,
  GainLossReconciliationDiagnosticReason,
  GainLossReconciliationOpenLot,
  GainLossReconciliationRealizedEvent,
  GainLossReconciliationRealizedEventLotMatch,
  GainLossReconciliationSummary,
  ReconciliationExecutionEventInput,
  ReconciliationOpenLotInput,
} from "./period-gain-loss-reconciliation-types";

export const VIRTUAL_TRANSFER_CLEARING_ACCOUNT_PREFIX =
  "virtual:transfer-clearing:account:";

function getDiagnosticMessage(
  reason: GainLossReconciliationDiagnosticReason,
): string {
  switch (reason) {
    case "missingInitialRate":
      return "Missing initial valuation rate for opening balance.";
    case "missingConversion":
      return "Missing booking conversion into reference currency.";
    case "invalidExecutionPrice":
      return "Execution price could not be derived from converted values.";
    case "missingPeriodEndRate":
      return "Missing period-end valuation rate for open lots.";
    default: {
      const _exhaustiveCheck: never = reason;
      return _exhaustiveCheck;
    }
  }
}

export function pushDiagnostic(
  diagnostics: GainLossReconciliationDiagnostic[],
  args: {
    reason: GainLossReconciliationDiagnosticReason;
    date: Date;
    bookingId?: string;
    bookingDescription?: string | null;
    transactionId?: string | null;
    transactionDescription?: string | null;
  },
) {
  diagnostics.push({
    reason: args.reason,
    message: getDiagnosticMessage(args.reason),
    bookingId: args.bookingId ?? null,
    bookingDescription: args.bookingDescription ?? null,
    transactionId: args.transactionId ?? null,
    transactionDescription: args.transactionDescription ?? null,
    date: args.date.toISOString(),
  });
}

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
  event: ReconciliationExecutionEventInput,
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
  lot: ReconciliationOpenLotInput,
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

export function toSummary(args: {
  realizedGainLoss: Money;
  unrealizedGainLoss: Money;
}): GainLossReconciliationSummary<Money> {
  const realizedGainLoss = round2(args.realizedGainLoss);
  const unrealizedGainLoss = round2(args.unrealizedGainLoss);
  return {
    realizedGainLoss,
    unrealizedGainLoss,
    totalGainLoss: round2(moneyAdd(realizedGainLoss, unrealizedGainLoss)),
  };
}

export function toEmptySummary(): GainLossReconciliationSummary<Money> {
  return {
    realizedGainLoss: toMoney(0),
    unrealizedGainLoss: toMoney(0),
    totalGainLoss: toMoney(0),
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

export function toVirtualTransferClearingAccountId(unitKey: string): string {
  return `${VIRTUAL_TRANSFER_CLEARING_ACCOUNT_PREFIX}${unitKey}`;
}
