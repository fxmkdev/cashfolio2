import { normalizeDateInputValueToUtcDay } from "@/shared/date";
import type { TransactionFormValues } from "./edit-transaction-modal-types";

export function isTransactionFormDirty(
  values: TransactionFormValues,
  initialValues: TransactionFormValues,
  locale?: string,
): boolean {
  function dateSnapshot(value: Date | string | undefined) {
    return (
      normalizeDateInputValueToUtcDay(value, locale)?.toISOString() ??
      value ??
      null
    );
  }

  // Date inputs and grid editors can represent the same calendar day as a
  // local Date or an ISO string. Compare those days, not their representation
  // or the generated booking keys. Preserve invalid values for dirty checks.
  function snapshot(form: TransactionFormValues) {
    return JSON.stringify({
      date: dateSnapshot(form.date),
      description: form.description ?? "",
      bookings: form.bookings.map((booking) => ({
        date: dateSnapshot(booking.date),
        account: booking.account ?? "",
        description: booking.description ?? "",
        unit: booking.unit ?? null,
        currency: booking.currency ?? null,
        cryptocurrency: booking.cryptocurrency ?? null,
        symbol: booking.symbol ?? null,
        tradeCurrency: booking.tradeCurrency ?? null,
        debit: booking.debit ?? null,
        credit: booking.credit ?? null,
      })),
    });
  }

  return snapshot(values) !== snapshot(initialValues);
}
