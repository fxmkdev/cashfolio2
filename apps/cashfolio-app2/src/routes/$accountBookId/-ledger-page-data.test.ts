import { describe, expect, test } from "vitest";
import { AccountType, Unit } from "../../.prisma-client/enums";
import {
  buildLedgerBalanceChartPoints,
  createLedgerBalanceFormatter,
  deriveSimpleTransactionEditState,
  getUnitLabel,
} from "./-ledger-page-data";
import type { LedgerAccount, LedgerBookings } from "./-ledger-page-types";

function createLedgerAccount(type: AccountType): LedgerAccount {
  return {
    id: "account-1",
    name: "Account",
    isActive: true,
    type,
    equityAccountSubtype: null,
    unit: Unit.CURRENCY,
    currency: "CHF",
    cryptocurrency: null,
    symbol: null,
    tradeCurrency: null,
    groupPathSegments: [],
  };
}

function createLedgerBookings(
  entries: Array<{ date: string; value: number }>,
): LedgerBookings {
  return entries.map((entry, index) => ({
    id: `booking-${index + 1}`,
    date: new Date(entry.date),
    description: "",
    value: entry.value,
    unit: Unit.CURRENCY,
    currency: "CHF",
    cryptocurrency: null,
    symbol: null,
    tradeCurrency: null,
    transactionId: `transaction-${index + 1}`,
    transactionDescription: "",
    counterpartyAccounts: [],
  }));
}

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

describe("buildLedgerBalanceChartPoints", () => {
  const fixedToday = new Date("2026-01-11T12:00:00.000Z");

  test("builds running daily closing balances for asset accounts", () => {
    const points = buildLedgerBalanceChartPoints(
      createLedgerAccount(AccountType.ASSET),
      createLedgerBookings([
        {
          date: "2026-01-10T09:00:00.000Z",
          value: 100,
        },
        {
          date: "2026-01-11T09:00:00.000Z",
          value: -40,
        },
      ]),
      fixedToday,
    );

    expect(points).toEqual([
      {
        date: new Date("2026-01-10T00:00:00"),
        dateKey: "2026-01-10",
        dateLabel: "10.01.2026",
        balance: 100,
      },
      {
        date: new Date("2026-01-11T00:00:00"),
        dateKey: "2026-01-11",
        dateLabel: "11.01.2026",
        balance: 60,
      },
    ]);
  });

  test("applies liability sign convention to chart balances", () => {
    const points = buildLedgerBalanceChartPoints(
      createLedgerAccount(AccountType.LIABILITY),
      createLedgerBookings([
        {
          date: "2026-01-10T09:00:00.000Z",
          value: -100,
        },
        {
          date: "2026-01-11T09:00:00.000Z",
          value: 20,
        },
      ]),
      fixedToday,
    );

    expect(points).toEqual([
      {
        date: new Date("2026-01-10T00:00:00"),
        dateKey: "2026-01-10",
        dateLabel: "10.01.2026",
        balance: 100,
      },
      {
        date: new Date("2026-01-11T00:00:00"),
        dateKey: "2026-01-11",
        dateLabel: "11.01.2026",
        balance: 80,
      },
    ]);
  });

  test("keeps only end-of-day closing point for dates with multiple bookings", () => {
    const points = buildLedgerBalanceChartPoints(
      createLedgerAccount(AccountType.ASSET),
      createLedgerBookings([
        {
          date: "2026-01-10T09:00:00.000Z",
          value: 100,
        },
        {
          date: "2026-01-10T12:00:00.000Z",
          value: -10,
        },
        {
          date: "2026-01-10T15:00:00.000Z",
          value: -15,
        },
        {
          date: "2026-01-11T09:00:00.000Z",
          value: 5,
        },
      ]),
      fixedToday,
    );

    expect(points).toEqual([
      {
        date: new Date("2026-01-10T00:00:00"),
        dateKey: "2026-01-10",
        dateLabel: "10.01.2026",
        balance: 75,
      },
      {
        date: new Date("2026-01-11T00:00:00"),
        dateKey: "2026-01-11",
        dateLabel: "11.01.2026",
        balance: 80,
      },
    ]);
  });

  test("returns an empty series when there are no bookings", () => {
    const points = buildLedgerBalanceChartPoints(
      createLedgerAccount(AccountType.ASSET),
      [],
      fixedToday,
    );

    expect(points).toEqual([]);
  });

  test("extends the series to today when latest booking is before today", () => {
    const points = buildLedgerBalanceChartPoints(
      createLedgerAccount(AccountType.ASSET),
      createLedgerBookings([
        {
          date: "2026-01-10T09:00:00.000Z",
          value: 100,
        },
      ]),
      new Date("2026-01-12T12:00:00.000Z"),
    );

    expect(points).toEqual([
      {
        date: new Date("2026-01-10T00:00:00"),
        dateKey: "2026-01-10",
        dateLabel: "10.01.2026",
        balance: 100,
      },
      {
        date: new Date("2026-01-12T00:00:00"),
        dateKey: "2026-01-12",
        dateLabel: "12.01.2026",
        balance: 100,
      },
    ]);
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

    expect(formatBalance(1234.5)).toBe("CHF 1’234.50");
  });
});
