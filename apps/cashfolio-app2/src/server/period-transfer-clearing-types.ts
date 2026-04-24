import { Unit } from "../.prisma-client/enums";
import type { EndOfPeriodBalanceAccount } from "./period-balance-stats";

export type TransferClearingBooking = {
  id: string;
  date: Date;
  value: number;
  unit: Unit;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
};

export type TransferClearingUnitType =
  | "currency"
  | "security"
  | "cryptocurrency";

export type TransferClearingUnitBucket = {
  unitKey: string;
  unitLabel: string;
  unitType: TransferClearingUnitType;
  unit: Unit;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
  isNonReferenceUnit: boolean;
  rawBalance: number;
  bookings: TransferClearingBooking[];
};

export type TransferClearingVirtualGroup = {
  id: string;
  name: string;
  parentGroupId: string | null;
};

export type TransferClearingVirtualAccount = EndOfPeriodBalanceAccount & {
  name: string;
  groupId: string | null;
};

export const TRANSFER_CLEARING_BOOKINGS_PAGE_SIZE = 1_000;

export const TRANSFER_CLEARING_ROOT_GROUP_ID = "virtual:transfer-clearing";
export const TRANSFER_CLEARING_CURRENCY_GROUP_ID =
  "virtual:transfer-clearing:currency";
export const TRANSFER_CLEARING_SECURITY_GROUP_ID =
  "virtual:transfer-clearing:security";
export const TRANSFER_CLEARING_CRYPTOCURRENCY_GROUP_ID =
  "virtual:transfer-clearing:cryptocurrency";

export function toTransferClearingLotSortKey(args: {
  date: Date;
  bookingId: string;
}) {
  return `${args.date.toISOString()}::${args.bookingId}`;
}
