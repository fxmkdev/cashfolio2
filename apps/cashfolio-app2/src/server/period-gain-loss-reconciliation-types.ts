import type { Unit } from "../.prisma-client/enums";
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

export type GainLossReconciliationRealizedEventLotMatch = {
  id: string;
  acquisitionSortKey: string;
  acquisitionDate: string;
  acquisitionBookingId: string;
  matchedQuantity: number;
  rawMatchedQuantity: number;
  lotUnitCostInReference: number;
  rawLotUnitCostInReference: number;
  executionUnitPriceInReference: number;
  rawExecutionUnitPriceInReference: number;
  realizedGainLossDelta: number;
  rawRealizedGainLossDelta: number;
  runningEventRealizedGainLoss: number;
  rawRunningEventRealizedGainLoss: number;
};

export type GainLossReconciliationRealizedEvent = {
  id: string;
  date: string;
  bookingId: string;
  bookingDescription: string | null;
  transactionId: string | null;
  transactionDescription: string | null;
  quantity: number;
  rawQuantity: number;
  effectiveReferenceAmount: number;
  rawEffectiveReferenceAmount: number;
  executionUnitPriceInReference: number;
  rawExecutionUnitPriceInReference: number;
  realizedGainLossDelta: number;
  rawRealizedGainLossDelta: number;
  runningRealizedGainLoss: number;
  rawRunningRealizedGainLoss: number;
  lotMatches: GainLossReconciliationRealizedEventLotMatch[];
  pricing: {
    source: "directConversion" | "residualAdjusted" | "marketFallback";
    marketReferenceAmount: number;
    residualAllocationAmount: number;
    effectiveReferenceAmount: number;
  };
  rounding: {
    rawEffectiveReferenceAmount: number;
    roundedEffectiveReferenceAmount: number;
    rawExecutionUnitPriceInReference: number;
    roundedExecutionUnitPriceInReference: number;
    rawRealizedGainLossDelta: number;
    roundedRealizedGainLossDelta: number;
    rawRunningRealizedGainLoss: number;
    roundedRunningRealizedGainLoss: number;
  };
};

export type GainLossReconciliationOpenLot = {
  id: string;
  acquisitionSortKey: string;
  acquisitionDate: string;
  acquisitionBookingId: string;
  quantity: number;
  rawQuantity: number;
  unitCostInReference: number;
  rawUnitCostInReference: number;
  periodEndRate: number;
  rawPeriodEndRate: number;
  unrealizedGainLoss: number;
  rawUnrealizedGainLoss: number;
  runningUnrealizedGainLoss: number;
  rawRunningUnrealizedGainLoss: number;
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

export type GainLossReconciliationSummary = {
  realizedGainLoss: number;
  unrealizedGainLoss: number;
  totalGainLoss: number;
};

export type GainLossReconciliationDetails = {
  target: GainLossReconciliationTarget;
  summary: GainLossReconciliationSummary;
  skippedCount: number;
  realizedEvents: GainLossReconciliationRealizedEvent[];
  unrealizedOpenLots: GainLossReconciliationOpenLot[];
  diagnostics: GainLossReconciliationDiagnostic[];
};

export type ReconciliationExecutionEventInput = {
  bookingId: string;
  bookingDescription?: string | null;
  transactionId: string | null;
  transactionDescription?: string | null;
  date: Date;
  quantity: number;
  pricingSource: "directConversion" | "residualAdjusted" | "marketFallback";
  marketReferenceAmount: number;
  residualAllocationAmount: number;
  effectiveReferenceAmount: number;
  executionUnitPriceInReference: number;
  realizedGainLossDelta: number;
  runningRealizedGainLoss: number;
  lotMatches: Array<{
    acquisitionSortKey: string;
    matchedQuantity: number;
    lotUnitCostInReference: number;
    executionUnitPriceInReference: number;
    realizedGainLossDelta: number;
    runningEventRealizedGainLoss: number;
  }>;
};

export type ReconciliationOpenLotInput = {
  acquisitionSortKey: string;
  quantity: number;
  unitCostInReference: number;
  periodEndRate: number;
  unrealizedGainLoss: number;
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
  summaryRaw: GainLossReconciliationSummary;
  realizedEvents: GainLossReconciliationRealizedEvent[];
  unrealizedOpenLots: GainLossReconciliationOpenLot[];
  diagnostics: {
    skippedCount: number;
    items: GainLossReconciliationDiagnostic[];
  };
};
