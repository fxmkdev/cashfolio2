import { describe, expect, test } from "vitest";
import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "@/.prisma-client/enums";
import { createSplitInitialValuesFromSimpleDraft } from "./page-edit-flow";

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
      type: AccountType.BALANCE,
      equityAccountSubtype: null,
    },
    {
      label: "Groceries",
      value: "account-counter",
      unit: null,
      currency: null,
      cryptocurrency: null,
      symbol: null,
      tradeCurrency: null,
      type: AccountType.EQUITY,
      equityAccountSubtype: EquityAccountSubtype.EXPENSE,
    },
    {
      label: "Savings",
      value: "account-savings",
      unit: Unit.CURRENCY,
      currency: "CHF",
      cryptocurrency: null,
      symbol: null,
      tradeCurrency: null,
      type: AccountType.BALANCE,
      equityAccountSubtype: null,
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

  test.each([
    { amount: undefined, direction: "DEBIT" },
    { amount: "", direction: "CREDIT" },
    { amount: "12.5", direction: "DEBIT" },
    { amount: "12.5", direction: "CREDIT" },
  ] as const)(
    "keeps the counter booking empty for amount $amount and direction $direction",
    ({ amount, direction }) => {
      const result = createSplitInitialValuesFromSimpleDraft({
        draft: {
          date: new Date("2026-01-11T00:00:00.000Z"),
          description: "Draft transaction",
          counterAccountId: "",
          amount,
          direction,
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

      const expectedAmount = amount ? 12.5 : undefined;
      const isDebit = direction === "DEBIT";
      expect(result).toEqual({
        description: "Draft transaction",
        bookings: [
          {
            date: "2026-01-11T00:00:00.000Z",
            account: "account-current",
            description: "",
            unit: Unit.CURRENCY,
            currency: "CHF",
            debit: isDebit ? expectedAmount : undefined,
            credit: isDebit ? undefined : expectedAmount,
          },
          {
            date: "2026-01-11T00:00:00.000Z",
            account: "",
            description: "",
            debit: isDebit ? undefined : expectedAmount,
            credit: isDebit ? expectedAmount : undefined,
          },
        ],
      });
    },
  );

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

  test.each(["account-savings", "account-counter"])(
    "keeps the explicit counter selection %s and its booking unit",
    (counterAccountId) => {
      const result = createSplitInitialValuesFromSimpleDraft({
        draft: {
          date: new Date("2026-01-11T00:00:00.000Z"),
          description: "Selected counter account",
          counterAccountId,
          amount: 10,
          direction: "CREDIT",
        },
        fallback: {
          date: new Date("2026-01-10T00:00:00.000Z"),
          description: "",
          counterAccountId: "",
          amount: 0,
          direction: "DEBIT",
        },
        allAccountOptions,
        currentAccount,
      });

      expect(result.bookings?.[1]).toMatchObject({
        account: counterAccountId,
        unit: Unit.CURRENCY,
        currency: "CHF",
        debit: 10,
        credit: undefined,
      });
    },
  );
});
