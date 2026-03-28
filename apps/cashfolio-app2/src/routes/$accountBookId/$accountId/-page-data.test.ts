import { describe, expect, test } from "vitest";
import { AccountType, Unit } from "@/.prisma-client/enums";
import {
  buildLedgerRows,
  buildLedgerBalanceChartPoints,
  createLedgerBalanceFormatter,
  deriveSimpleTransactionEditState,
  getUnitLabel,
} from "./-page-data";
import type { LedgerAccount, LedgerBookings } from "./-page-types";

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
  entries: Array<{
    date: Date;
    value: number;
    valueInReferenceCurrency?: number | null;
  }>,
): LedgerBookings {
  return entries.map((entry, index) => ({
    id: `booking-${index + 1}`,
    date: new Date(entry.date.getTime()),
    description: "",
    value: entry.value,
    valueInReferenceCurrency:
      entry.valueInReferenceCurrency === undefined
        ? entry.value
        : entry.valueInReferenceCurrency,
    unit: Unit.CURRENCY,
    currency: "CHF",
    cryptocurrency: null,
    symbol: null,
    tradeCurrency: null,
    transactionId: `transaction-${index + 1}`,
    transactionDescription: "",
    counterpartyAccounts: [],
    isOpeningBalancesTransaction: false,
  }));
}

function localDate(
  year: number,
  monthIndex: number,
  day: number,
  hour: number = 0,
): Date {
  return new Date(year, monthIndex, day, hour, 0, 0, 0);
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
  const fixedToday = localDate(2026, 0, 11, 12);

  test("builds running daily closing balances for asset accounts", () => {
    const points = buildLedgerBalanceChartPoints(
      createLedgerAccount(AccountType.ASSET),
      createLedgerBookings([
        {
          date: localDate(2026, 0, 10, 9),
          value: 100,
        },
        {
          date: localDate(2026, 0, 11, 9),
          value: -40,
        },
      ]),
      fixedToday,
    );

    expect(points).toEqual([
      {
        date: localDate(2026, 0, 10, 0),
        dateKey: "2026-01-10",
        dateLabel: "10.01.2026",
        balance: 100,
      },
      {
        date: localDate(2026, 0, 11, 0),
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
          date: localDate(2026, 0, 10, 9),
          value: -100,
        },
        {
          date: localDate(2026, 0, 11, 9),
          value: 20,
        },
      ]),
      fixedToday,
    );

    expect(points).toEqual([
      {
        date: localDate(2026, 0, 10, 0),
        dateKey: "2026-01-10",
        dateLabel: "10.01.2026",
        balance: 100,
      },
      {
        date: localDate(2026, 0, 11, 0),
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
          date: localDate(2026, 0, 10, 9),
          value: 100,
        },
        {
          date: localDate(2026, 0, 10, 12),
          value: -10,
        },
        {
          date: localDate(2026, 0, 10, 15),
          value: -15,
        },
        {
          date: localDate(2026, 0, 11, 9),
          value: 5,
        },
      ]),
      fixedToday,
    );

    expect(points).toEqual([
      {
        date: localDate(2026, 0, 10, 0),
        dateKey: "2026-01-10",
        dateLabel: "10.01.2026",
        balance: 75,
      },
      {
        date: localDate(2026, 0, 11, 0),
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
          date: localDate(2026, 0, 10, 9),
          value: 100,
        },
      ]),
      localDate(2026, 0, 12, 12),
    );

    expect(points).toEqual([
      {
        date: localDate(2026, 0, 10, 0),
        dateKey: "2026-01-10",
        dateLabel: "10.01.2026",
        balance: 100,
      },
      {
        date: localDate(2026, 0, 12, 0),
        dateKey: "2026-01-12",
        dateLabel: "12.01.2026",
        balance: 100,
      },
    ]);
  });

  test("builds a reference-currency running balance when converted booking values are provided", () => {
    const bookings = createLedgerBookings([
      {
        date: localDate(2026, 0, 10, 9),
        value: 100,
      },
      {
        date: localDate(2026, 0, 11, 9),
        value: -40,
      },
    ]);

    const points = buildLedgerBalanceChartPoints(
      createLedgerAccount(AccountType.ASSET),
      bookings,
      fixedToday,
      new Map([
        [bookings[0].id, 108],
        [bookings[1].id, -43.2],
      ]),
    );

    expect(points).toEqual([
      {
        date: localDate(2026, 0, 10, 0),
        dateKey: "2026-01-10",
        dateLabel: "10.01.2026",
        balance: 100,
        balanceInReferenceCurrency: 108,
      },
      {
        date: localDate(2026, 0, 11, 0),
        dateKey: "2026-01-11",
        dateLabel: "11.01.2026",
        balance: 60,
        balanceInReferenceCurrency: 64.8,
      },
    ]);
  });

  test("keeps the reference-currency balance unavailable after a missing conversion", () => {
    const bookings = createLedgerBookings([
      {
        date: localDate(2026, 0, 10, 9),
        value: 100,
      },
      {
        date: localDate(2026, 0, 11, 9),
        value: -40,
      },
      {
        date: localDate(2026, 0, 12, 9),
        value: 20,
      },
    ]);

    const points = buildLedgerBalanceChartPoints(
      createLedgerAccount(AccountType.ASSET),
      bookings,
      localDate(2026, 0, 13, 12),
      new Map([
        [bookings[0].id, 108],
        [bookings[1].id, null],
        [bookings[2].id, 21],
      ]),
    );

    expect(points).toEqual([
      {
        date: localDate(2026, 0, 10, 0),
        dateKey: "2026-01-10",
        dateLabel: "10.01.2026",
        balance: 100,
        balanceInReferenceCurrency: 108,
      },
      {
        date: localDate(2026, 0, 11, 0),
        dateKey: "2026-01-11",
        dateLabel: "11.01.2026",
        balance: 60,
        balanceInReferenceCurrency: null,
      },
      {
        date: localDate(2026, 0, 12, 0),
        dateKey: "2026-01-12",
        dateLabel: "12.01.2026",
        balance: 80,
        balanceInReferenceCurrency: null,
      },
      {
        date: localDate(2026, 0, 13, 0),
        dateKey: "2026-01-13",
        dateLabel: "13.01.2026",
        balance: 80,
        balanceInReferenceCurrency: null,
      },
    ]);
  });
});

describe("buildLedgerRows", () => {
  test("keeps equity balance empty when period filter is not active", () => {
    const rows = buildLedgerRows(
      createLedgerAccount(AccountType.EQUITY),
      createLedgerBookings([
        {
          date: localDate(2026, 0, 10, 9),
          value: 100,
        },
      ]),
    );

    expect(rows).toEqual([
      expect.objectContaining({
        balance: null,
      }),
    ]);
  });

  test("shows converted equity debit/credit and running balance when period filter is active", () => {
    const rows = buildLedgerRows(
      createLedgerAccount(AccountType.EQUITY),
      createLedgerBookings([
        {
          date: localDate(2026, 0, 10, 9),
          value: 100,
          valueInReferenceCurrency: 150,
        },
        {
          date: localDate(2026, 0, 11, 9),
          value: -40,
          valueInReferenceCurrency: -40,
        },
      ]),
      { hasPeriodFilter: true },
    );

    expect(rows).toEqual([
      expect.objectContaining({
        date: "11.01.2026",
        referenceDebit: null,
        referenceCredit: 40,
        balance: -110,
      }),
      expect.objectContaining({
        date: "10.01.2026",
        referenceDebit: 150,
        referenceCredit: null,
        balance: -150,
      }),
    ]);
  });

  test("keeps converted equity balance empty when a booking conversion is unavailable", () => {
    const rows = buildLedgerRows(
      createLedgerAccount(AccountType.EQUITY),
      createLedgerBookings([
        {
          date: localDate(2026, 0, 10, 9),
          value: 100,
          valueInReferenceCurrency: 150,
        },
        {
          date: localDate(2026, 0, 11, 9),
          value: -40,
          valueInReferenceCurrency: null,
        },
      ]),
      { hasPeriodFilter: true },
    );

    expect(rows).toEqual([
      expect.objectContaining({
        date: "11.01.2026",
        referenceDebit: null,
        referenceCredit: null,
        balance: null,
      }),
      expect.objectContaining({
        date: "10.01.2026",
        referenceDebit: 150,
        referenceCredit: null,
        balance: -150,
      }),
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
