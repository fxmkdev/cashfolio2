import type { Money } from "../../../shared/money";
import type { ReturnAccount } from "../../../shared/accounts/account-return-groups";
import type {
  HoldingTransaction,
  HoldingTransactionBooking,
  HoldingBookingConverter,
} from "../../holdings/types";

type UnitIdentity = Pick<
  HoldingTransactionBooking,
  "unit" | "currency" | "cryptocurrency" | "symbol" | "tradeCurrency"
>;
export type ReturnPositionChange = UnitIdentity & {
  accountId: string;
  date: string;
  quantity: Money;
};
export type ReturnMovement = {
  id: string;
  accountId: string;
  peerId?: string;
  date: string;
  amount: Money;
  transactionId: string | null;
  description: string;
};
export type ReturnBridge = UnitIdentity & {
  fromId: string;
  toId: string;
  fromDate: string;
  toDate: string;
  quantity: Money;
};
export type PreparedReturnTransactions = {
  changes: ReturnPositionChange[];
  movements: ReturnMovement[];
  bridges: ReturnBridge[];
  failures: Map<string, string[]>;
  recordedAccountIds: Set<string>;
};
export type ReturnPreparationArgs = {
  accounts: ReturnAccount[];
  transactions: HoldingTransaction[];
  referenceCurrency: string;
  startDate: string;
  asOfDate: string;
  convert: HoldingBookingConverter;
};
export type ReturnTransactionContext = Pick<
  ReturnPreparationArgs,
  "referenceCurrency" | "startDate" | "asOfDate" | "convert"
> & {
  result: PreparedReturnTransactions;
  accountIds: Set<string>;
  fail: (ids: string[], message: string) => void;
  convertCapital: (
    booking: HoldingTransactionBooking,
  ) => ReturnType<HoldingBookingConverter>;
  movement: (
    booking: HoldingTransactionBooking,
    amount: Money,
    suffix?: string,
    peerId?: string,
  ) => ReturnMovement;
};
