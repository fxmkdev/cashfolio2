import type { Unit } from "../.prisma-client/enums";

export type HoldingExecutionPricingSource =
  "directConversion" | "residualAdjusted" | "marketFallback" | "transferBasis";

export type HoldingGainLossSkippedReason =
  | "missingInitialRate"
  | "missingConversion"
  | "invalidExecutionPrice"
  | "missingPeriodEndRate";

export type AccountGainLossSourceRow<Amount = number> = {
  id: string;
  date: string;
  transactionId: string;
  description: string | null;
  amount: Amount;
};

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
    source: HoldingExecutionPricingSource;
    marketReferenceAmount: Amount | null;
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

export type GainLossReconciliationOpenLot<
  Amount = number,
  Valuation = Amount,
> = {
  id: string;
  acquisitionSortKey: string;
  acquisitionDate: string;
  acquisitionBookingId: string;
  quantity: Amount;
  unitCostInReference: Amount;
  periodEndRate: Valuation;
  unrealizedGainLoss: Valuation;
  runningUnrealizedGainLoss: Valuation;
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

export type PeriodGainLossReconciliation = {
  sources?: {
    calculatedRealizedGainLoss: number;
    recordedGainLoss: number;
    attributionExplanation: string | null;
    recordedAdjustments: AccountGainLossSourceRow[];
    executionResiduals: AccountGainLossSourceRow[];
  };
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
