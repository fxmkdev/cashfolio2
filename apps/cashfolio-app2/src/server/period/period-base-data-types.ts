import type {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../../.prisma-client/enums";
import type { PeriodSpecifier } from "./period-selection";
import type { TransferClearingUnitBucket } from "./period-transfer-clearing";

type PeriodBaseSelectionData = {
  periodValue: string;
  label: string;
  periodSpecifier: PeriodSpecifier;
  granularity: "month" | "year";
  year: number;
  month: number | null;
  from: Date;
  to: Date;
  queryEndExclusive: Date;
  initialHoldingDate: Date;
  isBeforeAccountBookStart: boolean;
  minPeriodDate: Date;
};

export type PeriodBaseAssetLiabilityAccount = {
  id: string;
  name: string;
  groupId: string | null;
  type: AccountType;
  unit: Unit | null;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
  isCashAccount: boolean;
};

type PeriodBaseHoldingAccount = {
  id: string;
  unit: Unit;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
};

type PeriodBaseAccountGroup = {
  id: string;
  name: string;
  parentGroupId: string | null;
};

export type PeriodBaseEquityBooking = {
  id: string;
  accountId: string;
  accountName: string;
  accountGroupId: string | null;
  equityAccountSubtype: EquityAccountSubtype;
  transactionId: string;
  date: Date;
  value: number;
  unit: Unit;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
};

type PeriodBaseExplicitCounterpart = {
  transactionId: string;
  accountId: string;
  accountName: string;
};

type PeriodBaseRawBalance = {
  accountId: string;
  rawBalance: number;
};

type PeriodBaseHoldingBooking = {
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

export type PeriodBaseHoldingTransaction = {
  id: string;
  bookings: PeriodBaseHoldingBooking[];
};

export type PeriodBaseCashFlowTransaction = {
  id: string;
  bookings: Array<{
    id: string;
    date: Date;
    value: number;
    unit: Unit;
    currency: string | null;
    cryptocurrency: string | null;
    symbol: string | null;
    tradeCurrency: string | null;
    account: {
      id: string;
      name: string;
      groupId: string | null;
      type: AccountType;
      isCashAccount: boolean;
    };
  }>;
};

type PeriodBaseInitialHoldingBalance = {
  accountId: string;
  rawBalance: number;
};

export type PeriodBaseData = {
  accountBookId: string;
  periodValue: string;
  referenceCurrency: string;
  selection: PeriodBaseSelectionData;
  allAccountGroups: PeriodBaseAccountGroup[];
  baseAssetLiabilityAccounts: PeriodBaseAssetLiabilityAccount[];
  holdingAccountsResolved: PeriodBaseHoldingAccount[];
  endOfPeriodRawBalances: PeriodBaseRawBalance[];
  transferClearingUnitBuckets: TransferClearingUnitBucket[];
  equityBookings: PeriodBaseEquityBooking[];
  explicitCounterparts: PeriodBaseExplicitCounterpart[];
  initialHoldingBalances: PeriodBaseInitialHoldingBalance[];
  holdingTransactions: PeriodBaseHoldingTransaction[];
  cashFlowTransactions: PeriodBaseCashFlowTransaction[];
  hasCashAccounts: boolean;
};
