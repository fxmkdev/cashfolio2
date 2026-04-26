import {
  type AccountType,
  type EquityAccountSubtype,
  type Unit,
} from "../.prisma-client/enums";

export type HoldingRateConvertibleAccount = {
  id: string;
  unit: Unit;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
};

export type HoldingTransactionBooking = {
  id: string;
  description?: string | null;
  transactionDescription?: string | null;
  transactionId?: string | null;
  accountId: string;
  date: Date;
  value: number;
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
  quantity: number;
  unitCostInReference: number;
  acquisitionSortKey: string;
};

export type HoldingExecutionPricingSource =
  | "directConversion"
  | "residualAdjusted"
  | "marketFallback";

export type HoldingExecutionLotMatch = {
  acquisitionSortKey: string;
  matchedQuantity: number;
  lotUnitCostInReference: number;
  executionUnitPriceInReference: number;
  realizedGainLossDelta: number;
  runningRealizedGainLoss: number;
};

export type HoldingExecutionEvent = {
  bookingId: string;
  bookingDescription?: string | null;
  transactionDescription?: string | null;
  transactionId?: string | null;
  date: Date;
  quantity: number;
  pricingSource: HoldingExecutionPricingSource;
  marketReferenceAmount: number;
  residualAllocationAmount: number;
  effectiveReferenceAmount: number;
};

export type HoldingAccountState = {
  account: HoldingRateConvertibleAccount;
  lots: HoldingLot[];
  executionEvents: HoldingExecutionEvent[];
  skipped: boolean;
};

export type HoldingRateResolver = (input: {
  unit: Unit;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
  date: Date;
}) => Promise<number | null>;

export type HoldingBookingConverter = (booking: {
  id: string;
  value: number;
  unit: Unit;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
  date: Date;
}) => Promise<number | null>;

export type HoldingGainLossWorkingState = {
  stateByHoldingAccountId: Map<string, HoldingAccountState>;
  skippedCount: number;
  convertedCount: number;
};
