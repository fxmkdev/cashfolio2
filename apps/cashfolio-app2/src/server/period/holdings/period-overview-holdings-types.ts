import { type Money } from "../../../shared/money";
import {
  type AccountType,
  type EquityAccountSubtype,
  type Unit,
} from "../../../.prisma-client/enums";

export type HoldingRateConvertibleAccount = {
  id: string;
  unit: Unit;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
};

export type HoldingTransactionBooking = {
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

export type HoldingExecutionPricingSource =
  "directConversion" | "residualAdjusted" | "marketFallback" | "transferBasis";

export type HoldingExecutionLotMatch = {
  acquisitionSortKey: string;
  matchedQuantity: Money;
  lotUnitCostInReference: Money;
  executionUnitPriceInReference: Money;
  realizedGainLossDelta: Money;
  runningEventRealizedGainLoss: Money;
};

export type HoldingExecutionEvent = {
  portion?: "transfer-fallback";
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

export type HoldingGainLossSkippedReason =
  | "missingInitialRate"
  | "missingConversion"
  | "invalidExecutionPrice"
  | "missingPeriodEndRate";

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
