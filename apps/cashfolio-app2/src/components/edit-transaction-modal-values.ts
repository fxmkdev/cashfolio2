import { createId } from "@paralleldrive/cuid2";
import { min } from "date-fns";
import type { Unit } from "../.prisma-client/enums";
import type {
  AccountOption,
  BookingValues,
  TransactionFormValues,
} from "./edit-transaction-modal-types";

export function createTransactionFormInitialValues(args: {
  initialValues?: {
    description?: string;
    bookings?: Omit<BookingValues, "key">[];
  };
  currentAccountId: string;
  currentAccount?: AccountOption;
}): TransactionFormValues {
  return {
    date:
      args.initialValues?.bookings && args.initialValues.bookings.length > 0
        ? min(
            args.initialValues.bookings
              .map((d) => d.date as string)
              .filter((d) => !!d),
          )
        : undefined,
    description: args.initialValues?.description,
    bookings: args.initialValues?.bookings?.map((b) => ({
      ...b,
      key: createId(),
    })) ?? [
      {
        key: createId(),
        account: args.currentAccountId,
        unit: args.currentAccount?.unit,
        currency: args.currentAccount?.currency ?? undefined,
        cryptocurrency: args.currentAccount?.cryptocurrency ?? undefined,
        symbol: args.currentAccount?.symbol ?? undefined,
        tradeCurrency: args.currentAccount?.tradeCurrency ?? undefined,
      } as BookingValues,
      { key: createId() } as BookingValues,
    ],
  };
}

export function toTransactionSubmitBookings(bookings: BookingValues[]): {
  date: string;
  accountId: string;
  description: string;
  unit: Unit;
  currency?: string;
  cryptocurrency?: string;
  symbol?: string;
  tradeCurrency?: string;
  value: number;
}[] {
  return bookings.map((booking) => ({
    date:
      booking.date &&
      typeof booking.date === "object" &&
      "toISOString" in booking.date
        ? (booking.date as Date).toISOString()
        : String(booking.date ?? ""),
    accountId: booking.account ?? "",
    description: booking.description ?? "",
    unit: booking.unit!,
    currency: booking.currency ?? undefined,
    cryptocurrency: booking.cryptocurrency ?? undefined,
    symbol: booking.symbol ?? undefined,
    tradeCurrency: booking.tradeCurrency ?? undefined,
    value: booking.debit ? booking.debit : -(booking.credit ?? 0),
  }));
}
