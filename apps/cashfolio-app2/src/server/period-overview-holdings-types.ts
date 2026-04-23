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

export type HoldingExecutionEvent = {
  bookingId: string;
  date: Date;
  quantity: number;
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
