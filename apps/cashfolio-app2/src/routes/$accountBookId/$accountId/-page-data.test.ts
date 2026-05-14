import { describe, expect, test } from "vitest";
import { AccountType, Unit } from "@/.prisma-client/enums";
import {
  createAccountOptions,
  createLedgerBalanceFormatter,
  deriveSimpleTransactionEditState,
  getUnitLabel,
} from "./-page-data";

describe("getUnitLabel", () => {
  test("returns security symbol for security units", () => {
    expect(
      getUnitLabel({
        unit: Unit.SECURITY,
        currency: null,
        cryptocurrency: null,
        symbol: "VWCE",
        tradeCurrency: "USD",
      }),
    ).toBe("VWCE");
  });
});

describe("createAccountOptions", () => {
  test("uses server-provided group path segments for tree paths", () => {
    const [option] = createAccountOptions(
      [
        {
          id: "account-checking",
          name: "Checking",
          groupPath: "Assets / Cash / Bank / Daily",
          groupPathSegments: ["Assets", "Cash / Bank", "Daily"],
          unit: Unit.CURRENCY,
          currency: "CHF",
          cryptocurrency: null,
          symbol: null,
          tradeCurrency: null,
          type: AccountType.ASSET,
          equityAccountSubtype: null,
        } as unknown as Parameters<typeof createAccountOptions>[0][number],
      ],
      () => true,
    );

    expect(option?.treePath).toEqual([
      "Asset",
      "Assets",
      "Cash / Bank",
      "Daily",
    ]);
  });
});

describe("deriveSimpleTransactionEditState", () => {
  test("returns simple initial values for an eligible transaction", () => {
    const result = deriveSimpleTransactionEditState({
      currentAccountId: "cash",
      transaction: {
        description: "Groceries",
        bookings: [
          {
            date: "2026-01-10T00:00:00.000Z",
            account: "cash",
            description: "",
            unit: Unit.CURRENCY,
            currency: "CHF",
            debit: undefined,
            credit: 42,
          },
          {
            date: "2026-01-10T00:00:00.000Z",
            account: "expense",
            description: "",
            unit: Unit.CURRENCY,
            currency: "CHF",
            debit: 42,
            credit: undefined,
          },
        ],
      },
    });

    expect(result.eligible).toBe(true);
    if (!result.eligible) return;

    expect(result.initialValues.counterAccountId).toBe("expense");
    expect(result.initialValues.amount).toBe(42);
    expect(result.initialValues.direction).toBe("CREDIT");
    expect(result.initialValues.description).toBe("Groceries");
  });

  test("rejects transactions with more than two bookings", () => {
    const result = deriveSimpleTransactionEditState({
      currentAccountId: "cash",
      transaction: {
        bookings: [
          {
            date: "2026-01-10T00:00:00.000Z",
            account: "cash",
            description: "",
            unit: Unit.CURRENCY,
            currency: "CHF",
            debit: 10,
          },
          {
            date: "2026-01-10T00:00:00.000Z",
            account: "expense",
            description: "",
            unit: Unit.CURRENCY,
            currency: "CHF",
            credit: 7,
          },
          {
            date: "2026-01-10T00:00:00.000Z",
            account: "savings",
            description: "",
            unit: Unit.CURRENCY,
            currency: "CHF",
            credit: 3,
          },
        ],
      },
    });

    expect(result.eligible).toBe(false);
    if (result.eligible) return;
    expect(result.disabledReason).toContain("exactly two bookings");
  });

  test("rejects transactions with different booking dates", () => {
    const result = deriveSimpleTransactionEditState({
      currentAccountId: "cash",
      transaction: {
        bookings: [
          {
            date: "2026-01-10T00:00:00.000Z",
            account: "cash",
            description: "",
            unit: Unit.CURRENCY,
            currency: "CHF",
            debit: 10,
          },
          {
            date: "2026-01-11T00:00:00.000Z",
            account: "expense",
            description: "",
            unit: Unit.CURRENCY,
            currency: "CHF",
            credit: 10,
          },
        ],
      },
    });

    expect(result.eligible).toBe(false);
    if (result.eligible) return;
    expect(result.disabledReason).toContain("same date");
  });

  test("rejects transactions with booking descriptions", () => {
    const result = deriveSimpleTransactionEditState({
      currentAccountId: "cash",
      transaction: {
        bookings: [
          {
            date: "2026-01-10T00:00:00.000Z",
            account: "cash",
            description: "Cash leg",
            unit: Unit.CURRENCY,
            currency: "CHF",
            debit: 10,
          },
          {
            date: "2026-01-10T00:00:00.000Z",
            account: "expense",
            description: "",
            unit: Unit.CURRENCY,
            currency: "CHF",
            credit: 10,
          },
        ],
      },
    });

    expect(result.eligible).toBe(false);
    if (result.eligible) return;
    expect(result.disabledReason).toContain("booking descriptions");
  });

  test("rejects transactions when booking amounts differ", () => {
    const result = deriveSimpleTransactionEditState({
      currentAccountId: "cash",
      transaction: {
        bookings: [
          {
            date: "2026-01-10T00:00:00.000Z",
            account: "cash",
            description: "",
            unit: Unit.CURRENCY,
            currency: "CHF",
            credit: 10,
          },
          {
            date: "2026-01-10T00:00:00.000Z",
            account: "expense",
            description: "",
            unit: Unit.CURRENCY,
            currency: "CHF",
            debit: 9,
          },
        ],
      },
    });

    expect(result.eligible).toBe(false);
    if (result.eligible) return;
    expect(result.disabledReason).toContain("matching amounts");
  });

  test("rejects transactions when booking sides are not opposite", () => {
    const result = deriveSimpleTransactionEditState({
      currentAccountId: "cash",
      transaction: {
        bookings: [
          {
            date: "2026-01-10T00:00:00.000Z",
            account: "cash",
            description: "",
            unit: Unit.CURRENCY,
            currency: "CHF",
            credit: 10,
          },
          {
            date: "2026-01-10T00:00:00.000Z",
            account: "expense",
            description: "",
            unit: Unit.CURRENCY,
            currency: "CHF",
            credit: 10,
          },
        ],
      },
    });

    expect(result.eligible).toBe(false);
    if (result.eligible) return;
    expect(result.disabledReason).toContain("one debit and one credit");
  });
});

describe("createLedgerBalanceFormatter", () => {
  test("formats currency balances with en-CH currency formatting", () => {
    const formatBalance = createLedgerBalanceFormatter({
      unit: Unit.CURRENCY,
      currency: "CHF",
      cryptocurrency: null,
      symbol: null,
      tradeCurrency: null,
    });

    const formatted = formatBalance(1234.5);
    const normalized = formatted.replace(/\s+/g, " ");

    expect(normalized).toMatch(/^CHF 1[\u2019',\s]234\.50$/);
  });

  test("formats non-currency balances with a unit label", () => {
    const formatBalance = createLedgerBalanceFormatter({
      unit: Unit.CRYPTOCURRENCY,
      currency: null,
      cryptocurrency: "BTC",
      symbol: null,
      tradeCurrency: null,
    });

    expect(formatBalance(123)).toContain("BTC");
  });
});
