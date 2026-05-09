import { AccountType } from "../.prisma-client/enums";
import type {
  AccountOption,
  BookingValues,
} from "./edit-transaction-modal-types";

export function createBookingUnitDefaults(args: {
  selectedAccount: AccountOption;
  lockedBooking: BookingValues | undefined;
}): Pick<
  BookingValues,
  "unit" | "currency" | "cryptocurrency" | "symbol" | "tradeCurrency"
> {
  if (
    args.selectedAccount.type === AccountType.EQUITY &&
    !args.selectedAccount.unit
  ) {
    return {
      unit: args.lockedBooking?.unit,
      currency: args.lockedBooking?.currency,
      cryptocurrency: args.lockedBooking?.cryptocurrency,
      symbol: args.lockedBooking?.symbol,
      tradeCurrency: args.lockedBooking?.tradeCurrency,
    };
  }

  return {
    unit: args.selectedAccount.unit,
    currency: args.selectedAccount.currency ?? undefined,
    cryptocurrency: args.selectedAccount.cryptocurrency ?? undefined,
    symbol: args.selectedAccount.symbol ?? undefined,
    tradeCurrency: args.selectedAccount.tradeCurrency ?? undefined,
  };
}
