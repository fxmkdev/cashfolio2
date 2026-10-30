import { createId } from "@paralleldrive/cuid2";
import { earliestDate } from "../../shared/date";
import type { Unit } from "../../.prisma-client/enums";
import {
  createDateInputValueFromUtcDay,
  formatDateInputValueAsUtcDayIsoString,
  normalizeDateInputValueToUtcDay,
} from "../../shared/date";
import type { AccountOption } from "@/shared/account-options";
import type {
  BookingValues,
  TransactionFormValues,
} from "./edit-transaction-modal-types";

export function createTransactionFormInitialValues(args: {
  initialValues?: {
    description?: string;
    bookings?: Omit<BookingValues, "key">[];
  };
  currentAccountId?: string;
  currentAccount?: AccountOption;
}): TransactionFormValues {
  const initialBookingDates =
    args.initialValues?.bookings
      ?.map((booking) => booking.date)
      .filter(
        (date): date is NonNullable<BookingValues["date"]> => date != null,
      )
      .map((date) => normalizeDateInputValueToUtcDay(date))
      .filter((date): date is Date => date != null) ?? [];
  const initialDate =
    initialBookingDates.length > 0
      ? (createDateInputValueFromUtcDay(earliestDate(initialBookingDates)) ??
        undefined)
      : undefined;

  return {
    date: initialDate,
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

export function createCopyTransactionInitialValues(args: {
  description?: string;
  bookings?: Omit<BookingValues, "key">[];
}): {
  description?: string;
  bookings?: Omit<BookingValues, "key">[];
} {
  return {
    description: args.description,
    bookings: args.bookings?.map((booking) => ({ ...booking })),
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
    date: formatDateInputValueAsUtcDayIsoString(booking.date),
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
