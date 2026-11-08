import { describe, expect, it, vi } from "vitest";
import type {
  CellValueChangedEvent,
  GridApi,
  RowDragEndEvent,
} from "ag-grid-enterprise";
import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "@/.prisma-client/enums";
import type { AccountOption } from "@/shared/accounts/account-options";
import type { BookingValues } from "../edit-transaction-modal-types";
import {
  addBooking,
  changeBookingCell,
  deleteBooking,
  reorderBookingRows,
} from "./grid-events";
import { createFormFixture } from "./test-support";

const locked: BookingValues = {
  key: "locked",
  account: "cash",
  unit: Unit.CURRENCY,
  currency: "CHF",
};
const accounts: AccountOption[] = [
  {
    value: "income",
    label: "Income",
    type: AccountType.EQUITY,
    unit: null,
    equityAccountSubtype: EquityAccountSubtype.INCOME,
  },
  {
    value: "expense",
    label: "Expense",
    type: AccountType.EQUITY,
    unit: null,
    equityAccountSubtype: EquityAccountSubtype.EXPENSE,
  },
  {
    value: "eur",
    label: "EUR",
    type: AccountType.BALANCE,
    unit: Unit.CURRENCY,
    currency: "EUR",
  },
];
function fixture(booking: Partial<BookingValues> = {}) {
  return createFormFixture({
    bookings: [{ ...locked }, { key: "other", ...booking }],
  });
}
function cellEvent(
  field: keyof BookingValues,
  newValue: unknown,
  colId?: string,
) {
  const setData = vi.fn();
  const event = {
    rowIndex: 1,
    colDef: { field, colId },
    newValue,
    data: { key: "other" },
    api: { getRowNode: () => ({ setData }) },
  } as unknown as CellValueChangedEvent<BookingValues>;
  return { event, setData };
}
function dragEvent(keys: string[]) {
  return {
    api: {
      forEachNodeAfterFilterAndSort: (
        callback: (node: { data: { key: string } }) => void,
      ) => {
        keys.forEach((key) => callback({ data: { key } }));
      },
    },
  } as unknown as RowDragEndEvent<BookingValues>;
}

describe("booking grid events", () => {
  it.each([
    [Unit.CURRENCY, "currency"],
    [Unit.CRYPTOCURRENCY, "cryptocurrency"],
    [Unit.SECURITY, "tradeCurrency"],
  ] as const)("maps the currency column for %s to %s", (unit, field) => {
    const { form, setFieldValue } = fixture({ unit });
    changeBookingCell({
      form,
      accounts,
      event: cellEvent("currency", "EUR", "ccy").event,
    });
    expect(setFieldValue).toHaveBeenCalledExactlyOnceWith(
      `bookings.1.${field}`,
      "EUR",
    );
    expect(form.values.bookings[1][field]).toBe("EUR");
  });
  it("ignores currency edits when no unit is selected", () => {
    const { form, setFieldValue } = fixture();
    changeBookingCell({
      form,
      accounts,
      event: cellEvent("currency", "EUR", "ccy").event,
    });
    expect(setFieldValue).not.toHaveBeenCalled();
  });
  it.each(["debit", "credit"] as const)(
    "clears the opposite amount after a %s edit",
    (field) => {
      const { form } = fixture({ debit: 10, credit: 12 });
      changeBookingCell({ form, accounts, event: cellEvent(field, 25).event });
      expect(form.values.bookings[1][field]).toBe(25);
      expect(
        form.values.bookings[1][field === "credit" ? "debit" : "credit"],
      ).toBeUndefined();
    },
  );
  it.each([
    ["income", "debit", "credit"],
    ["expense", "credit", "debit"],
  ] as const)(
    "applies %s restrictions without changing existing category units or dates",
    (account, cleared, retained) => {
      const date = "2026-03-03T00:00:00.000Z";
      const { form } = fixture({
        unit: Unit.SECURITY,
        symbol: "AAPL",
        tradeCurrency: "USD",
        date,
        debit: 10,
        credit: 20,
      });
      const { event, setData } = cellEvent("account", account);
      changeBookingCell({ form, accounts, lockedBookingKey: "locked", event });
      const booking = form.values.bookings[1];
      expect(booking).toMatchObject({
        account,
        unit: Unit.SECURITY,
        symbol: "AAPL",
        tradeCurrency: "USD",
        date,
      });
      expect(booking[cleared]).toBeUndefined();
      expect(booking[retained]).toBe(retained === "credit" ? 20 : 10);
      expect(setData).toHaveBeenCalledExactlyOnceWith(booking);
    },
  );
  it("inherits the locked booking's units only when a category booking has none", () => {
    const { form } = fixture();
    changeBookingCell({
      form,
      accounts,
      lockedBookingKey: "locked",
      event: cellEvent("account", "expense").event,
    });
    expect(form.values.bookings[1]).toMatchObject({
      unit: Unit.CURRENCY,
      currency: "CHF",
    });
  });
  it("replaces unit metadata when selecting a fixed-unit balance account", () => {
    const { form } = fixture({
      unit: Unit.SECURITY,
      symbol: "AAPL",
      tradeCurrency: "USD",
    });
    changeBookingCell({
      form,
      accounts,
      event: cellEvent("account", "eur").event,
    });
    expect(form.values.bookings[1]).toMatchObject({
      unit: Unit.CURRENCY,
      currency: "EUR",
    });
    expect(form.values.bookings[1].symbol).toBeUndefined();
    expect(form.values.bookings[1].tradeCurrency).toBeUndefined();
  });
  it("keeps an unavailable account selection for validation without applying defaults", () => {
    const { form } = fixture({ unit: Unit.CURRENCY, currency: "USD" });
    const { event, setData } = cellEvent("account", "missing");
    changeBookingCell({ form, accounts, event });
    expect(form.values.bookings[1]).toMatchObject({
      account: "missing",
      currency: "USD",
    });
    expect(setData).not.toHaveBeenCalled();
  });
  it("ignores pinned/non-row cell events", () => {
    const { form, setFieldValue } = fixture();
    const { event } = cellEvent("description", "draft");
    event.rowIndex = null;
    changeBookingCell({ form, accounts, event });
    expect(setFieldValue).not.toHaveBeenCalled();
  });
  it("persists complete display order using the original form rows", () => {
    const { form, setFieldValue } = fixture({ description: "keep" });
    const rows = [...form.values.bookings];
    reorderBookingRows(form, dragEvent(["other", "locked"]));
    expect(setFieldValue).toHaveBeenCalledExactlyOnceWith("bookings", [
      rows[1],
      rows[0],
    ]);
    expect(form.values.bookings[0]).toBe(rows[1]);
  });
  it.each([
    { name: "filtered rows", keys: ["locked"] },
    { name: "unknown rows", keys: ["locked", "unknown"] },
    { name: "duplicate rows", keys: ["locked", "locked"] },
    { name: "unchanged rows", keys: ["locked", "other"] },
  ])("ignores $name in the display order", ({ keys }) => {
    const { form, setFieldValue } = fixture();
    reorderBookingRows(form, dragEvent(keys));
    expect(setFieldValue).not.toHaveBeenCalled();
  });
  it("adds a keyed booking with the transaction date and scrolls to it", () => {
    const { form, insertListItem } = fixture();
    form.values.date = new Date(2026, 2, 3);
    const applyTransaction = vi.fn(() => ({ add: [{ rowIndex: 2 }] }));
    const ensureIndexVisible = vi.fn();
    addBooking(form, {
      applyTransaction,
      ensureIndexVisible,
    } as unknown as GridApi<BookingValues>);
    expect(insertListItem).toHaveBeenCalledWith(
      "bookings",
      expect.objectContaining({
        key: expect.any(String),
        date: form.values.date,
        account: "",
        description: "",
      }),
    );
    expect(ensureIndexVisible).toHaveBeenCalledExactlyOnceWith(2, "bottom");
  });
  it("deletes by key and blocks deletion during submission", () => {
    const { form, removeListItem } = fixture();
    deleteBooking(form, "other", true);
    expect(removeListItem).not.toHaveBeenCalled();
    deleteBooking(form, "other", false);
    expect(removeListItem).toHaveBeenCalledExactlyOnceWith("bookings", 1);
    expect(() => deleteBooking(form, "missing", false)).toThrow(
      "Booking not found",
    );
  });
});
