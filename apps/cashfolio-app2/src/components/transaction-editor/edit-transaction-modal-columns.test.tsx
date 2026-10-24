import { describe, expect, test } from "vitest";
import { AccountType, Unit } from "../../.prisma-client/enums";
import {
  ACCOUNT_TREE_SELECT_COLUMN,
  columnTypes,
  FORMATTED_NUMERIC_COLUMN,
  SELECT_COLUMN,
} from "../grid/column-types";
import {
  createEditTransactionColumnDefs,
  getMixedUnitTransactionFooterLabel,
} from "./edit-transaction-modal-columns";
import type { AccountOption } from "@/shared/account-options";
import type { BookingValues } from "./edit-transaction-modal-types";

const accounts: AccountOption[] = [
  {
    value: "account-checking",
    label: "Checking",
    treePath: ["Asset", "Cash"],
    type: AccountType.BALANCE,
    unit: Unit.CURRENCY,
    currency: "CHF",
  },
];

describe("createEditTransactionColumnDefs", () => {
  test("shows full fractional COP precision in debit and credit entry columns", () => {
    const columnDefs = createEditTransactionColumnDefs({
      accounts,
      isSubmitting: false,
      accountBookStartDate: new Date("2026-01-04T00:00:00.000Z"),
    });
    const formatter = columnTypes?.[FORMATTED_NUMERIC_COLUMN]?.valueFormatter;
    if (typeof formatter !== "function") {
      throw new Error("Expected a numeric value formatter");
    }

    for (const field of ["debit", "credit"]) {
      const colDef = columnDefs.find((column) => column.field === field);
      expect(colDef?.context?.formattedNumeric?.formattedNumericMode).toBe(
        "entry",
      );
      expect(
        formatter({
          value: 1234.5678,
          data: { unit: Unit.CURRENCY, currency: "COP" },
          colDef,
          context: { userLocale: "en-CH" },
        } as never),
      ).toBe("1'234.5678");
    }
  });

  test("uses TreeSelect only for the booking account column", () => {
    const columnDefs = createEditTransactionColumnDefs({
      accounts,
      isSubmitting: false,
      accountBookStartDate: new Date("2026-01-04T00:00:00.000Z"),
      unitUsage: { currencies: ["CHF"], cryptocurrencies: ["BTC"] },
    });

    expect(columnDefs.find((column) => column.field === "account")?.type).toBe(
      ACCOUNT_TREE_SELECT_COLUMN,
    );
    expect(columnDefs.find((column) => column.field === "unit")?.type).toBe(
      SELECT_COLUMN,
    );
    expect(columnDefs.find((column) => column.colId === "ccy")?.type).toBe(
      SELECT_COLUMN,
    );
  });

  test("uses grouped account-book unit options for the currency column editor", () => {
    const columnDefs = createEditTransactionColumnDefs({
      accounts,
      isSubmitting: false,
      accountBookStartDate: new Date("2026-01-04T00:00:00.000Z"),
      unitUsage: { currencies: ["CHF", "USD"], cryptocurrencies: ["BTC"] },
    });
    const currencyColumn = columnDefs.find((column) => column.colId === "ccy");

    const currencyEditorParams = currencyColumn?.cellEditorParams?.({
      data: { key: "row-1", unit: Unit.CURRENCY, currency: "CHF" },
    });
    expect(currencyEditorParams?.options[0]).toEqual({
      group: "Used",
      items: [
        { value: "CHF", label: "CHF" },
        { value: "USD", label: "USD" },
      ],
    });

    const cryptocurrencyEditorParams = currencyColumn?.cellEditorParams?.({
      data: {
        key: "row-2",
        unit: Unit.CRYPTOCURRENCY,
        cryptocurrency: "BTC",
      },
    });
    expect(cryptocurrencyEditorParams?.options[0]).toEqual({
      group: "Used",
      items: [{ value: "BTC", label: "BTC" }],
    });
  });

  test("detects same-unit transaction footers as numeric totals", () => {
    expect(
      getMixedUnitTransactionFooterLabel({
        bookings: [
          {
            key: "row-1",
            unit: Unit.CURRENCY,
            currency: "CHF",
            debit: 10,
          },
          {
            key: "row-2",
            unit: Unit.CURRENCY,
            currency: "CHF",
            credit: 20,
          },
        ],
      }),
    ).toBeNull();
  });

  test("detects mixed units across debit and credit as a mixed transaction footer", () => {
    expect(
      getMixedUnitTransactionFooterLabel({
        bookings: [
          {
            key: "row-1",
            unit: Unit.CURRENCY,
            currency: "CHF",
            debit: 10,
          },
          {
            key: "row-2",
            unit: Unit.CURRENCY,
            currency: "USD",
            credit: 20,
          },
        ],
      }),
    ).toBe("Multiple Units");
  });

  test("detects debit-side-only and credit-side-only mixed units as mixed transaction footers", () => {
    const mixedDebitBookings: BookingValues[] = [
      { key: "row-1", unit: Unit.CURRENCY, currency: "CHF", debit: 10 },
      { key: "row-2", unit: Unit.CURRENCY, currency: "USD", debit: 20 },
    ];
    const mixedCreditBookings: BookingValues[] = [
      { key: "row-1", unit: Unit.CURRENCY, currency: "CHF", credit: 10 },
      { key: "row-2", unit: Unit.CURRENCY, currency: "USD", credit: 20 },
    ];

    expect(
      getMixedUnitTransactionFooterLabel({ bookings: mixedDebitBookings }),
    ).toBe("Multiple Units");
    expect(
      getMixedUnitTransactionFooterLabel({ bookings: mixedCreditBookings }),
    ).toBe("Multiple Units");
  });

  test("treats matching displayed currency with different unit identities as mixed", () => {
    expect(
      getMixedUnitTransactionFooterLabel({
        bookings: [
          {
            key: "row-1",
            unit: Unit.CURRENCY,
            currency: "USD",
            debit: 10,
          },
          {
            key: "row-2",
            unit: Unit.SECURITY,
            symbol: "AAPL",
            tradeCurrency: "USD",
            debit: 1,
          },
        ],
      }),
    ).toBe("Multiple Units");
  });

  test("ignores rows without debit or credit amounts", () => {
    expect(
      getMixedUnitTransactionFooterLabel({
        bookings: [
          {
            key: "row-1",
            unit: Unit.CURRENCY,
            currency: "USD",
          },
          {
            key: "row-2",
            unit: Unit.CURRENCY,
            currency: "CHF",
            debit: 10,
          },
        ],
      }),
    ).toBeNull();
  });

  test("treats amount rows with missing unit identity as mixed", () => {
    expect(
      getMixedUnitTransactionFooterLabel({
        bookings: [
          {
            key: "row-1",
            unit: Unit.CURRENCY,
            debit: 0,
          },
          {
            key: "row-2",
            unit: Unit.CURRENCY,
            currency: "CHF",
            debit: 10,
          },
        ],
      }),
    ).toBe("Multiple Units");
  });

  test("uses one merged mixed marker only for mixed pinned transaction footers", () => {
    const columnDefs = createEditTransactionColumnDefs({
      accounts,
      isSubmitting: false,
      accountBookStartDate: new Date("2026-01-04T00:00:00.000Z"),
    });
    const debitColumn = columnDefs.find((column) => column.field === "debit");
    const creditColumn = columnDefs.find((column) => column.field === "credit");
    const mixedBookings: BookingValues[] = [
      {
        key: "row-1",
        unit: Unit.CURRENCY,
        currency: "CHF",
        debit: 10,
      },
      {
        key: "row-2",
        unit: Unit.CURRENCY,
        currency: "USD",
        debit: 20,
      },
    ];
    const sameUnitBookings: BookingValues[] = [
      {
        key: "row-1",
        unit: Unit.CURRENCY,
        currency: "CHF",
        debit: 10,
      },
      {
        key: "row-2",
        unit: Unit.CURRENCY,
        currency: "CHF",
        debit: 20,
      },
    ];

    const mixedRenderer = debitColumn?.cellRendererSelector?.({
      context: { form: { values: { bookings: mixedBookings } } },
      node: { rowPinned: "bottom" },
    } as never);
    expect(mixedRenderer?.component()).toBe("Multiple Units");

    expect(creditColumn?.cellRendererSelector).toBeUndefined();

    expect(
      debitColumn?.cellRendererSelector?.({
        context: { form: { values: { bookings: sameUnitBookings } } },
        node: { rowPinned: "bottom" },
      } as never),
    ).toBeUndefined();

    expect(
      debitColumn?.cellRendererSelector?.({
        context: { form: { values: { bookings: mixedBookings } } },
        node: { rowPinned: undefined },
      } as never),
    ).toBeUndefined();
  });

  test("prevents moving the debit and credit columns", () => {
    const columnDefs = createEditTransactionColumnDefs({
      accounts,
      isSubmitting: false,
      accountBookStartDate: new Date("2026-01-04T00:00:00.000Z"),
    });

    expect(
      columnDefs.find((column) => column.field === "debit")?.suppressMovable,
    ).toBe(true);
    expect(
      columnDefs.find((column) => column.field === "credit")?.suppressMovable,
    ).toBe(true);
  });

  test("spans the debit footer across debit and credit only for mixed transaction footers", () => {
    const columnDefs = createEditTransactionColumnDefs({
      accounts,
      isSubmitting: false,
      accountBookStartDate: new Date("2026-01-04T00:00:00.000Z"),
    });
    const debitColumn = columnDefs.find((column) => column.field === "debit");
    const mixedBookings: BookingValues[] = [
      { key: "row-1", unit: Unit.CURRENCY, currency: "CHF", debit: 10 },
      { key: "row-2", unit: Unit.CURRENCY, currency: "USD", credit: 20 },
    ];
    const sameUnitBookings: BookingValues[] = [
      { key: "row-1", unit: Unit.CURRENCY, currency: "CHF", debit: 10 },
      { key: "row-2", unit: Unit.CURRENCY, currency: "CHF", credit: 20 },
    ];

    expect(
      debitColumn?.colSpan?.({
        context: { form: { values: { bookings: mixedBookings } } },
        node: { rowPinned: "bottom" },
      } as never),
    ).toBe(2);

    expect(
      debitColumn?.colSpan?.({
        context: { form: { values: { bookings: sameUnitBookings } } },
        node: { rowPinned: "bottom" },
      } as never),
    ).toBe(1);

    expect(
      debitColumn?.colSpan?.({
        context: { form: { values: { bookings: mixedBookings } } },
        node: { rowPinned: undefined },
      } as never),
    ).toBe(1);
  });
});
