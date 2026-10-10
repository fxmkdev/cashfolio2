import { describe, expect, test } from "vitest";
import { Unit } from "@/.prisma-client/enums";
import type { TransactionFormValues } from "./edit-transaction-modal-types";
import { isTransactionFormDirty } from "./edit-transaction-modal-dirty-state";

function initialValues(): TransactionFormValues {
  return {
    date: new Date(2026, 4, 14),
    description: "Statement",
    bookings: [
      {
        key: "one",
        date: "2026-05-14T00:00:00.000Z",
        account: "cash",
        unit: Unit.CURRENCY,
        currency: "CHF",
        credit: 10,
      },
      {
        key: "two",
        date: "2026-05-14T00:00:00.000Z",
        account: "expense",
        unit: Unit.CURRENCY,
        currency: "CHF",
        debit: 10,
      },
    ],
  };
}

describe("transaction form dirty state", () => {
  test("ignores cloned dates, generated keys, and equivalent date representations", () => {
    const initial = initialValues();
    const current = structuredClone(initial);
    current.bookings = current.bookings.map((booking) => ({
      ...booking,
      key: "new-key",
      date: new Date(2026, 4, 14),
      description: "",
    }));
    expect(isTransactionFormDirty(current, initial)).toBe(false);
  });

  test("restoring dates and descriptions makes the form clean", () => {
    const initial = initialValues();
    const current = structuredClone(initial);
    current.description = "Changed";
    current.date = new Date(2026, 4, 15);
    current.bookings[0]!.date = new Date(2026, 4, 15);
    expect(isTransactionFormDirty(current, initial)).toBe(true);
    current.description = initial.description;
    current.date = new Date(2026, 4, 14);
    current.bookings[0]!.date = new Date(2026, 4, 14);
    expect(isTransactionFormDirty(current, initial)).toBe(false);
  });

  test("retains invalid or missing date input as a change", () => {
    const initial = initialValues();
    const current = structuredClone(initial);
    current.bookings[0]!.date = "invalid date";
    expect(isTransactionFormDirty(current, initial)).toBe(true);
    current.bookings[0]!.date = undefined;
    expect(isTransactionFormDirty(current, initial)).toBe(true);
  });

  test("detects booking edits, additions, removals, and reordering", () => {
    const initial = initialValues();
    const current = structuredClone(initial);
    current.bookings[0]!.credit = 11;
    expect(isTransactionFormDirty(current, initial)).toBe(true);
    current.bookings[0]!.credit = 10;
    current.bookings.reverse();
    expect(isTransactionFormDirty(current, initial)).toBe(true);
    current.bookings.reverse();
    current.bookings.push({ key: "three" });
    expect(isTransactionFormDirty(current, initial)).toBe(true);
    current.bookings.splice(0, 2);
    expect(isTransactionFormDirty(current, initial)).toBe(true);
  });
});
