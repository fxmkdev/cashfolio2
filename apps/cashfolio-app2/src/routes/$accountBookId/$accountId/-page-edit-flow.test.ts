import { describe, expect, test } from "vitest";
import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "@/.prisma-client/enums";
import { createSplitInitialValuesFromSimpleDraft } from "./-page-edit-flow";

describe("createSplitInitialValuesFromSimpleDraft", () => {
  const allAccountOptions = [
    {
      label: "Main Cash",
      value: "account-current",
      unit: Unit.CURRENCY,
      currency: "CHF",
      cryptocurrency: null,
      symbol: null,
      tradeCurrency: null,
      type: AccountType.ASSET,
      equityAccountSubtype: null,
    },
    {
      label: "Groceries",
      value: "account-counter",
      unit: Unit.CURRENCY,
      currency: "CHF",
      cryptocurrency: null,
      symbol: null,
      tradeCurrency: null,
      type: AccountType.EQUITY,
      equityAccountSubtype: EquityAccountSubtype.EXPENSE,
    },
  ];

  const currentAccount = {
    id: "account-current",
    unit: Unit.CURRENCY,
    currency: "CHF",
    cryptocurrency: null,
    symbol: null,
    tradeCurrency: null,
  };

  test("keeps split debit/credit empty when simple draft amount is missing", () => {
    const result = createSplitInitialValuesFromSimpleDraft({
      draft: {
        date: null,
        description: "",
        counterAccountId: "account-counter",
        amount: undefined,
        direction: "DEBIT",
      },
      fallback: {
        date: new Date("2026-01-10T00:00:00.000Z"),
        description: "",
        counterAccountId: "account-counter",
        amount: 0,
        direction: "DEBIT",
      },
      allAccountOptions,
      currentAccount,
    });

    expect(result.bookings).toHaveLength(2);
    expect(result.bookings?.[0]?.debit).toBeUndefined();
    expect(result.bookings?.[0]?.credit).toBeUndefined();
    expect(result.bookings?.[1]?.debit).toBeUndefined();
    expect(result.bookings?.[1]?.credit).toBeUndefined();
  });

  test("maps a valid simple draft amount to split debit/credit rows", () => {
    const result = createSplitInitialValuesFromSimpleDraft({
      draft: {
        date: new Date("2026-01-11T00:00:00.000Z"),
        description: "Lunch",
        counterAccountId: "account-counter",
        amount: "12.5",
        direction: "CREDIT",
      },
      fallback: {
        date: new Date("2026-01-10T00:00:00.000Z"),
        description: "",
        counterAccountId: "account-counter",
        amount: 0,
        direction: "DEBIT",
      },
      allAccountOptions,
      currentAccount,
    });

    expect(result.bookings).toHaveLength(2);
    expect(result.bookings?.[0]?.debit).toBeUndefined();
    expect(result.bookings?.[0]?.credit).toBe(12.5);
    expect(result.bookings?.[1]?.debit).toBe(12.5);
    expect(result.bookings?.[1]?.credit).toBeUndefined();
  });
});
