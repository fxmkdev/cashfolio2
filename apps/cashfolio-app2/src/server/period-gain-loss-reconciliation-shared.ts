import { round2 } from "./period-helpers";
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

export const RECONCILIATION_TRANSACTIONS_PAGE_SIZE = 200;
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

function parseAcquisitionSortKey(sortKey: string): {
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
  const bookingId = sortKey.slice(separatorIndex + 2);
  const acquisitionDate = new Date(datePart);
  return {
    acquisitionDate: Number.isFinite(acquisitionDate.getTime())
      ? acquisitionDate.toISOString()
      : new Date(0).toISOString(),
    acquisitionBookingId: bookingId,
  };
}

function toRealizedEventLotMatches(args: {
  bookingId: string;
  lotMatches: Array<{
    acquisitionSortKey: string;
    matchedQuantity: number;
    lotUnitCostInReference: number;
    executionUnitPriceInReference: number;
    realizedGainLossDelta: number;
    runningEventRealizedGainLoss: number;
  }>;
}): GainLossReconciliationRealizedEventLotMatch[] {
  return args.lotMatches.map((lotMatch, index) => {
    const parsed = parseAcquisitionSortKey(lotMatch.acquisitionSortKey);
    return {
      id: `match:${args.bookingId}:${index + 1}`,
      acquisitionSortKey: lotMatch.acquisitionSortKey,
      acquisitionDate: parsed.acquisitionDate,
      acquisitionBookingId: parsed.acquisitionBookingId,
      matchedQuantity: round2(lotMatch.matchedQuantity),
      lotUnitCostInReference: round2(lotMatch.lotUnitCostInReference),
      executionUnitPriceInReference: round2(
        lotMatch.executionUnitPriceInReference,
      ),
      realizedGainLossDelta: round2(lotMatch.realizedGainLossDelta),
      runningEventRealizedGainLoss: round2(
        lotMatch.runningEventRealizedGainLoss,
      ),
    };
  });
}

export function toRoundedRealizedEvent(
  event: ReconciliationExecutionEventInput,
): GainLossReconciliationRealizedEvent {
  const roundedEffectiveReferenceAmount = round2(
    event.effectiveReferenceAmount,
  );
  const roundedExecutionUnitPriceInReference = round2(
    event.executionUnitPriceInReference,
  );
  const roundedRealizedGainLossDelta = round2(event.realizedGainLossDelta);
  const roundedRunningRealizedGainLoss = round2(event.runningRealizedGainLoss);

  return {
    id: `event:${event.bookingId}`,
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
      bookingId: event.bookingId,
      lotMatches: event.lotMatches,
    }),
    pricing: {
      source: event.pricingSource,
      marketReferenceAmount: round2(event.marketReferenceAmount),
      residualAllocationAmount: round2(event.residualAllocationAmount),
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
): GainLossReconciliationOpenLot {
  const parsed = parseAcquisitionSortKey(lot.acquisitionSortKey);
  return {
    id: `lot:${lot.acquisitionSortKey}`,
    acquisitionSortKey: lot.acquisitionSortKey,
    acquisitionDate: parsed.acquisitionDate,
    acquisitionBookingId: parsed.acquisitionBookingId,
    quantity: lot.quantity,
    unitCostInReference: round2(lot.unitCostInReference),
    periodEndRate: round2(lot.periodEndRate),
    unrealizedGainLoss: round2(lot.unrealizedGainLoss),
    runningUnrealizedGainLoss: 0,
  };
}

export function toSummary(args: {
  realizedGainLoss: number;
  unrealizedGainLoss: number;
}): GainLossReconciliationSummary {
  const realizedGainLoss = round2(args.realizedGainLoss);
  const unrealizedGainLoss = round2(args.unrealizedGainLoss);
  return {
    realizedGainLoss,
    unrealizedGainLoss,
    totalGainLoss: round2(realizedGainLoss + unrealizedGainLoss),
  };
}

export function toEmptySummary(): GainLossReconciliationSummary {
  return {
    realizedGainLoss: 0,
    unrealizedGainLoss: 0,
    totalGainLoss: 0,
  };
}

export function addRunningUnrealizedGainLoss(
  openLots: GainLossReconciliationOpenLot[],
): GainLossReconciliationOpenLot[] {
  const sortedOpenLots = [...openLots].sort((left, right) =>
    left.acquisitionSortKey.localeCompare(right.acquisitionSortKey, "en"),
  );
  let runningUnrealizedGainLoss = 0;

  return sortedOpenLots.map((openLot) => {
    runningUnrealizedGainLoss = round2(
      runningUnrealizedGainLoss + openLot.unrealizedGainLoss,
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
