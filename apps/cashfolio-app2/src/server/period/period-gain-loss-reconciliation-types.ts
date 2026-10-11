import type { Money } from "../../shared/money";
import type { Unit } from "../../.prisma-client/enums";
import type { HoldingGainLossSkippedReason } from "./period-overview-holdings";

export type GainLossReconciliationDiagnosticReason =
  HoldingGainLossSkippedReason;

export type GainLossReconciliationDiagnostic = {
  reason: GainLossReconciliationDiagnosticReason;
  message: string;
  bookingId: string | null;
  bookingDescription: string | null;
  transactionId: string | null;
  transactionDescription: string | null;
  date: string;
};

export type GainLossReconciliationRealizedEventLotMatch<Amount = number> = {
  id: string;
  acquisitionSortKey: string;
  acquisitionDate: string;
  acquisitionBookingId: string;
  matchedQuantity: Amount;
  lotUnitCostInReference: Amount;
  executionUnitPriceInReference: Amount;
  realizedGainLossDelta: Amount;
  runningEventRealizedGainLoss: Amount;
};

export type GainLossReconciliationRealizedEvent<Amount = number> = {
  id: string;
  date: string;
  bookingId: string;
  bookingDescription: string | null;
  transactionId: string | null;
  transactionDescription: string | null;
  quantity: Amount;
  effectiveReferenceAmount: Amount;
  executionUnitPriceInReference: Amount;
  realizedGainLossDelta: Amount;
  runningRealizedGainLoss: Amount;
  lotMatches: GainLossReconciliationRealizedEventLotMatch<Amount>[];
  pricing: {
    source: "directConversion" | "residualAdjusted" | "marketFallback";
    marketReferenceAmount: Amount;
    residualAllocationAmount: Amount;
    effectiveReferenceAmount: Amount;
  };
  rounding: {
    rawEffectiveReferenceAmount: Amount;
    roundedEffectiveReferenceAmount: Amount;
    rawExecutionUnitPriceInReference: Amount;
    roundedExecutionUnitPriceInReference: Amount;
    rawRealizedGainLossDelta: Amount;
    roundedRealizedGainLossDelta: Amount;
    rawRunningRealizedGainLoss: Amount;
    roundedRunningRealizedGainLoss: Amount;
  };
};

export type GainLossReconciliationOpenLot<Amount = number> = {
  id: string;
  acquisitionSortKey: string;
  acquisitionDate: string;
  acquisitionBookingId: string;
  quantity: Amount;
  unitCostInReference: Amount;
  periodEndRate: Amount;
  unrealizedGainLoss: Amount;
  runningUnrealizedGainLoss: Amount;
};

export type GainLossReconciliationTarget = {
  accountId: string;
  accountName: string;
  isVirtual: boolean;
  unit: Unit;
  unitLabel: string;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
};

export type GainLossReconciliationSummary<Amount = number> = {
  realizedGainLoss: Amount;
  unrealizedGainLoss: Amount;
  totalGainLoss: Amount;
};

export type GainLossReconciliationDetails<Amount = number> = {
  target: GainLossReconciliationTarget;
  summary: GainLossReconciliationSummary<Amount>;
  skippedCount: number;
  realizedEvents: GainLossReconciliationRealizedEvent<Amount>[];
  unrealizedOpenLots: GainLossReconciliationOpenLot<Amount>[];
  diagnostics: GainLossReconciliationDiagnostic[];
};

export type ReconciliationExecutionEventInput = {
  bookingId: string;
  bookingDescription?: string | null;
  transactionId: string | null;
  transactionDescription?: string | null;
  date: Date;
  quantity: Money;
  pricingSource: "directConversion" | "residualAdjusted" | "marketFallback";
  marketReferenceAmount: Money;
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

export type PeriodGainLossReconciliation = {
  target: GainLossReconciliationTarget;
  referenceCurrency: string;
  selectedPeriodValue: string;
  selectedPeriodLabel: string;
  selectedPeriodSpecifier: string;
  selectedGranularity: "month" | "year";
  selectedYear: number;
  selectedMonth: number | null;
  periodBounds: {
    minBookingDate: string | null;
    maxDate: string;
  };
  periodDateRange: {
    from: string;
    to: string;
  };
  summary: GainLossReconciliationSummary;
  realizedEvents: GainLossReconciliationRealizedEvent[];
  unrealizedOpenLots: GainLossReconciliationOpenLot[];
  diagnostics: {
    skippedCount: number;
    items: GainLossReconciliationDiagnostic[];
  };
};
