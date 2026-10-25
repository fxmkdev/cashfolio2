import { AccountType } from "../../.prisma-client/enums";
import type { AccountOption } from "@/shared/account-options";
import type { BookingValues } from "./edit-transaction-modal-types";

export function createBookingUnitDefaults(args: {
  selectedAccount: AccountOption;
  lockedBooking: BookingValues | undefined;
  currentBooking?: BookingValues;
}): Pick<
  BookingValues,
  "unit" | "currency" | "cryptocurrency" | "symbol" | "tradeCurrency"
> {
  if (
    args.selectedAccount.type === AccountType.EQUITY &&
    args.selectedAccount.unit == null
  ) {
    if (args.currentBooking?.unit != null) {
      return {
        unit: args.currentBooking?.unit,
        currency: args.currentBooking?.currency,
        cryptocurrency: args.currentBooking?.cryptocurrency,
        symbol: args.currentBooking?.symbol,
        tradeCurrency: args.currentBooking?.tradeCurrency,
      };
    }

    return {
      unit: args.lockedBooking?.unit,
      currency: args.lockedBooking?.currency,
      cryptocurrency: args.lockedBooking?.cryptocurrency,
      symbol: args.lockedBooking?.symbol,
      tradeCurrency: args.lockedBooking?.tradeCurrency,
    };
  }

  return {
    unit: args.selectedAccount.unit ?? undefined,
    currency: args.selectedAccount.currency ?? undefined,
    cryptocurrency: args.selectedAccount.cryptocurrency ?? undefined,
    symbol: args.selectedAccount.symbol ?? undefined,
    tradeCurrency: args.selectedAccount.tradeCurrency ?? undefined,
  };
}
