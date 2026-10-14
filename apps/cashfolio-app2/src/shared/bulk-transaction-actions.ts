import type { Unit } from "../.prisma-client/enums";
import type { AccountOption } from "@/shared/account-options";
import {
  getBookingUnitIdentifier,
  isBookingUnitCompatibleWithAccount,
  isBookingValueCompatibleWithAccountType,
  isOpeningBalancesAccount,
} from "./account-utils";

export type BulkActionRow = {
  id: string;
  transactionId: string;
  isOpeningBalancesTransaction: boolean;
  isVirtualCarryOver?: boolean;
};

export type BulkRebookBooking = {
  id: string;
  bookingValue: number;
  unit: Unit | null;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
};

export function isBulkActionRowSelectable(row: BulkActionRow | undefined) {
  return !!row && !row.isVirtualCarryOver && !row.isOpeningBalancesTransaction;
}

export function getBulkTransactionIds(rows: BulkActionRow[]) {
  return [...new Set(rows.map((row) => row.transactionId))];
}

export function getBulkRebookTargetOptions(args: {
  bookings: BulkRebookBooking[];
  currentAccountId: string;
  accountOptions: AccountOption[];
}): AccountOption[] {
  if (args.bookings.length === 0) return [];
  return args.accountOptions
    .filter(
      (account) =>
        account.value !== args.currentAccountId &&
        !isOpeningBalancesAccount(account) &&
        args.bookings.every((booking) => {
          if (
            !booking.unit ||
            !getBookingUnitIdentifier({ ...booking, unit: booking.unit })
          )
            return false;
          return (
            isBookingUnitCompatibleWithAccount(
              { ...booking, unit: booking.unit },
              account,
            ) &&
            isBookingValueCompatibleWithAccountType(
              booking.bookingValue,
              account,
            )
          );
        }),
    )
    .toSorted((a, b) => a.label.localeCompare(b.label));
}
