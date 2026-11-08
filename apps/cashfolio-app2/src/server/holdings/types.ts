import {
  type AccountType,
  type EquityAccountSubtype,
  type Unit,
} from "../../.prisma-client/enums";
import type {
  HoldingExecutionPricingSource,
  HoldingGainLossSkippedReason,
} from "../../shared/reporting/gain-loss-reconciliation";
import { type Money } from "../../shared/money";
export type {
  HoldingExecutionPricingSource,
  HoldingGainLossSkippedReason,
} from "../../shared/reporting/gain-loss-reconciliation";

export type HoldingRateConvertibleAccount = {
  id: string;
  unit: Unit;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
};

export type HoldingTransactionBooking = {
  executionPortion?: boolean;
  transferPeers?: { bookingId: string; quantity: Money }[];
  id: string;
  description?: string | null;
  transactionDescription?: string | null;
  transactionId?: string | null;
  accountId: string;
  date: Date;
  value: Money;
  unit: Unit;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
  accountType: AccountType;
  equityAccountSubtype: EquityAccountSubtype | null;
};

export type HoldingTransaction = {
  bookings: HoldingTransactionBooking[];
};

export type HoldingLot = {
  transferSourceBookingId?: string;
  quantity: Money;
  unitCostInReference: Money;
  acquisitionSortKey: string;
};

export type HoldingExecutionLotMatch = {
  acquisitionSortKey: string;
  matchedQuantity: Money;
  lotUnitCostInReference: Money;
  executionUnitPriceInReference: Money;
  realizedGainLossDelta: Money;
  runningEventRealizedGainLoss: Money;
};

export type HoldingExecutionEvent = {
  portion?: "transfer-fallback" | "execution";
  bookingId: string;
  bookingDescription?: string | null;
  transactionDescription?: string | null;
  transactionId?: string | null;
  date: Date;
  quantity: Money;
  pricingSource: HoldingExecutionPricingSource;
  marketReferenceAmount: Money | null;
  residualAllocationAmount: Money;
  effectiveReferenceAmount: Money;
};

export type HoldingAccountState = {
  account: HoldingRateConvertibleAccount;
  lots: HoldingLot[];
  executionEvents: HoldingExecutionEvent[];
  skipped: boolean;
  realizedGainLoss?: Money;
  processedExecutionEvents?: HoldingAccountExecutionEvent[];
};

export type HoldingRateResolver = (input: {
  unit: Unit;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
  date: Date;
}) => Promise<Money | null>;

export type HoldingBookingConverter = (booking: {
  id: string;
  value: Money;
  unit: Unit;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
  date: Date;
}) => Promise<Money | null>;

export type HoldingGainLossWorkingState = {
  holdingTransfers?: HoldingTransactionBooking[][];
  holdingCarries?: HoldingTransactionBooking[][];
  convertBookingToReference?: HoldingBookingConverter;
  stateByHoldingAccountId: Map<string, HoldingAccountState>;
  skippedCount: number;
  convertedCount: number;
};

export type HoldingInitialSkippedItem = {
  accountId: string;
  reason: HoldingGainLossSkippedReason;
  date: Date;
};

export type HoldingSkippedItem = HoldingInitialSkippedItem & {
  bookingId?: string;
  bookingDescription?: string | null;
  transactionDescription?: string | null;
  transactionId?: string | null;
};

export type HoldingTransactionSkippedItem = HoldingSkippedItem & {
  bookingId: string;
  transactionId: string | null;
};

export type HoldingAccountGainLoss = Omit<
  HoldingRateConvertibleAccount,
  "id"
> & {
  accountId: string;
  realizedGainLoss: Money;
  unrealizedGainLoss: Money;
};

export type HoldingAccountExecutionEvent = Omit<
  HoldingExecutionEvent,
  "transactionId"
> & {
  accountId: string;
  transactionId: string | null;
  executionUnitPriceInReference: Money;
  realizedGainLossDelta: Money;
  runningRealizedGainLoss: Money;
  lotMatches: HoldingExecutionLotMatch[];
};

export type HoldingAccountOpenLotValuation = {
  accountId: string;
  acquisitionSortKey: string;
  quantity: Money;
  unitCostInReference: Money;
  periodEndRate: Money;
  unrealizedGainLoss: Money;
};

export type HoldingGainLossFinalizationCallbacks = {
  onAccountGainLoss?: (gainLossByAccount: HoldingAccountGainLoss) => void;
  onAccountExecutionEvent?: (event: HoldingAccountExecutionEvent) => void;
  onAccountUnvaluedOpenLot?: (
    lot: Omit<
      HoldingAccountOpenLotValuation,
      "periodEndRate" | "unrealizedGainLoss"
    >,
  ) => void;
  onAccountOpenLotValuation?: (lot: HoldingAccountOpenLotValuation) => void;
  onSkippedItem?: (item: HoldingSkippedItem) => void;
};

/** Explain mapping also accepts synthetic execution events without an account ID. */
export type HoldingExecutionExplainInput = Omit<
  HoldingAccountExecutionEvent,
  "accountId"
>;

export type HoldingOpenLotExplainInput = Omit<
  HoldingAccountOpenLotValuation,
  "accountId"
>;

export type InitializeHoldingGainLossArgs = {
  holdingAccounts: HoldingRateConvertibleAccount[];
  initialBalanceByAccountId: Map<string, Money>;
  initialRateDate: Date;
  resolveRate: HoldingRateResolver;
  onSkippedItem?: (item: HoldingInitialSkippedItem) => void;
};

export type ApplyHoldingTransactionsArgs = {
  state: HoldingGainLossWorkingState;
  transactions: HoldingTransaction[];
  periodStart: Date;
  periodEndExclusive: Date;
  convertBookingToReference: HoldingBookingConverter;
  onSkippedItem?: (item: HoldingTransactionSkippedItem) => void;
};

export type FinalizeHoldingGainLossArgs = {
  state: HoldingGainLossWorkingState;
  periodEnd: Date;
  resolveRate: HoldingRateResolver;
} & HoldingGainLossFinalizationCallbacks;

export type ComputeHoldingGainLossArgs = {
  holdingAccounts: HoldingRateConvertibleAccount[];
  initialBalanceByAccountId: Map<string, Money>;
  transactions: HoldingTransaction[];
  periodStart: Date;
  periodEndExclusive: Date;
  initialRateDate: Date;
  periodEnd: Date;
  resolveRate: HoldingRateResolver;
  convertBookingToReference: HoldingBookingConverter;
} & HoldingGainLossFinalizationCallbacks;

export type ReplayHoldingExecutionsArgs = {
  state: HoldingGainLossWorkingState;
  captureLotMatches?: boolean;
  onSkippedItem?: (item: HoldingSkippedItem) => void;
};

export type HoldingGainLossResult = {
  realizedGainLoss: Money;
  unrealizedGainLoss: Money;
  convertedCount: number;
  skippedCount: number;
};
