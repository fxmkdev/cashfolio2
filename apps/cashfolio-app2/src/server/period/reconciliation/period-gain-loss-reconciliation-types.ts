import type { HoldingExecutionPricingSource } from "../../../shared/gain-loss-reconciliation";
import type { Money } from "../../../shared/money";

export type {
  GainLossReconciliationDiagnosticReason,
  GainLossReconciliationDiagnostic,
  GainLossReconciliationRealizedEventLotMatch,
  GainLossReconciliationRealizedEvent,
  GainLossReconciliationOpenLot,
  GainLossReconciliationTarget,
  GainLossReconciliationSummary,
  GainLossReconciliationDetails,
  PeriodGainLossReconciliation,
} from "../../../shared/gain-loss-reconciliation";

export type ReconciliationExecutionEventInput = {
  portion?: "transfer-fallback" | "execution";
  bookingId: string;
  bookingDescription?: string | null;
  transactionId: string | null;
  transactionDescription?: string | null;
  date: Date;
  quantity: Money;
  pricingSource: HoldingExecutionPricingSource;
  marketReferenceAmount: Money | null;
  residualAllocationAmount: Money;
  effectiveReferenceAmount: Money;
  executionUnitPriceInReference: Money;
  realizedGainLossDelta: Money;
  runningRealizedGainLoss: Money;
  lotMatches: Array<{
    acquisitionSortKey: string;
    matchedQuantity: Money;
    lotUnitCostInReference: Money;
    executionUnitPriceInReference: Money;
    realizedGainLossDelta: Money;
    runningEventRealizedGainLoss: Money;
  }>;
};

export type ReconciliationOpenLotInput = {
  acquisitionSortKey: string;
  quantity: Money;
  unitCostInReference: Money;
  periodEndRate: Money;
  unrealizedGainLoss: Money;
};
