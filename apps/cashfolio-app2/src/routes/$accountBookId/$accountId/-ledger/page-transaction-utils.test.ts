import { describe, expect, test } from "vitest";
import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "@/.prisma-client/enums";
import {
  buildSimpleTransactionValues,
  createCopySimpleTransactionInitialValues,
  normalizeSimpleDraft,
} from "./page-transaction-utils";

describe("normalizeSimpleDraft", () => {
  const fallback = {
    date: new Date("2026-01-15T00:00:00.000Z"),
    description: "Fallback description",
    counterAccountId: "fallback-counter",
    amount: 42,
    direction: "DEBIT" as const,
  };

  test("uses valid string dates from the draft", () => {
    const result = normalizeSimpleDraft({
      draft: {
        date: "2026-02-10T00:00:00.000Z",
        description: "Draft description",
        counterAccountId: "counter-1",
        amount: 10,
        direction: "CREDIT",
      },
      fallback,
    });

    expect(result.date).toBe("2026-02-10T00:00:00.000Z");
  });

  test("serializes DateInput draft dates as canonical UTC days", () => {
    const result = normalizeSimpleDraft({
      draft: {
        date: new Date(2026, 4, 18),
        description: "Draft description",
        counterAccountId: "counter-1",
        amount: 10,
        direction: "CREDIT",
      },
      fallback,
    });

    expect(result.date).toBe("2026-05-18T00:00:00.000Z");
  });

  test("falls back to the fallback date when draft date is invalid", () => {
    const result = normalizeSimpleDraft({
      draft: {
        date: "not-a-date",
        description: "Draft description",
        counterAccountId: "counter-1",
        amount: 10,
        direction: "CREDIT",
      },
      fallback,
    });

    expect(result.date).toBe(fallback.date.toISOString());
  });

  test("serializes DateInput fallback dates as canonical UTC days", () => {
    const result = normalizeSimpleDraft({
      draft: {
        date: "not-a-date",
        description: "Draft description",
        counterAccountId: "counter-1",
        amount: 10,
        direction: "CREDIT",
      },
      fallback: {
        ...fallback,
        date: new Date(2026, 4, 18),
      },
    });

    expect(result.date).toBe("2026-05-18T00:00:00.000Z");
  });
});

describe("createCopySimpleTransactionInitialValues", () => {
  test("keeps simple transaction fields and the source date", () => {
    const date = new Date("2026-01-15T00:00:00.000Z");
    const result = createCopySimpleTransactionInitialValues({
      date,
      description: "Salary",
      counterAccountId: "income-1",
      amount: 100,
      direction: "DEBIT",
    });

    expect(result).toEqual({
      date,
      description: "Salary",
      counterAccountId: "income-1",
      amount: 100,
      direction: "DEBIT",
    });
  });
});

describe("buildSimpleTransactionValues", () => {
  test("applies the selected simple date to both generated bookings", () => {
    const result = buildSimpleTransactionValues({
      values: {
        date: "2026-02-10T00:00:00.000Z",
        description: "Groceries",
        counterAccountId: "expense-1",
        amount: 25,
        direction: "CREDIT",
      },
      currentAccount: {
        id: "cash",
        unit: Unit.CURRENCY,
        currency: "CHF",
        cryptocurrency: null,
        symbol: null,
        tradeCurrency: null,
      },
      counterAccount: {
        label: "Groceries",
        value: "expense-1",
        unit: Unit.CURRENCY,
        currency: "CHF",
        cryptocurrency: null,
        symbol: null,
        tradeCurrency: null,
        type: AccountType.EQUITY,
        equityAccountSubtype: EquityAccountSubtype.EXPENSE,
      },
    });

    expect(result.bookings.map((booking) => booking.date)).toEqual([
      "2026-02-10T00:00:00.000Z",
      "2026-02-10T00:00:00.000Z",
    ]);
  });
});
