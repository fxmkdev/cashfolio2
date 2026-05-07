import { describe, expect, test } from "vitest";
import { AccountType, Unit } from "../.prisma-client/enums";
import { deriveLedgerPresentationData } from "./ledger-derivation";

function createAccount(args: { type: AccountType }) {
  return {
    type: args.type,
    equityAccountSubtype: null,
    unit: Unit.CURRENCY as Unit | null,
    currency: "CHF",
    cryptocurrency: null,
    symbol: null,
    tradeCurrency: null,
  };
}

function createBookings(
  entries: Array<{
    date: Date;
    value: number;
    valueInReferenceCurrency?: number | null;
  }>,
) {
  return entries.map((entry, index) => ({
    id: `booking-${index + 1}`,
    date: new Date(entry.date.getTime()),
    description: "",
    value: entry.value,
    valueInReferenceCurrency:
      entry.valueInReferenceCurrency === undefined
        ? entry.value
        : entry.valueInReferenceCurrency,
    unit: Unit.CURRENCY as Unit | null,
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

function utcDate(
  year: number,
  monthIndex: number,
  day: number,
  hour: number = 0,
): Date {
  return new Date(Date.UTC(year, monthIndex, day, hour, 0, 0, 0));
}

describe("deriveLedgerPresentationData", () => {
  test("orders rows newest-first and appends carry-over row for filtered assets", () => {
    const result = deriveLedgerPresentationData({
      account: createAccount({ type: AccountType.ASSET }),
      bookings: createBookings([
        { date: utcDate(2026, 0, 10, 9), value: -50 },
        { date: utcDate(2026, 0, 11, 9), value: 30 },
      ]),
      hasPeriodFilter: true,
      balanceBeforePeriodRaw: 200,
      hasBookingsBeforePeriod: true,
      today: utcDate(2026, 0, 11, 12),
    });

    expect(result.rows).toEqual([
      expect.objectContaining({ date: "11.01.2026", balance: 180 }),
      expect.objectContaining({ date: "10.01.2026", balance: 150 }),
      expect.objectContaining({
        date: "",
        description: "Balance carried forward",
        balance: 200,
        isVirtualCarryOver: true,
      }),
    ]);
  });

  test("seeds filtered liability balances from pre-period totals", () => {
    const result = deriveLedgerPresentationData({
      account: createAccount({ type: AccountType.LIABILITY }),
      bookings: createBookings([{ date: utcDate(2026, 0, 10, 9), value: 20 }]),
      hasPeriodFilter: true,
      balanceBeforePeriodRaw: -100,
      hasBookingsBeforePeriod: true,
      today: utcDate(2026, 0, 11, 12),
    });

    expect(result.rows).toEqual([
      expect.objectContaining({ date: "10.01.2026", balance: 80 }),
      expect.objectContaining({
        date: "",
        balance: 100,
        isVirtualCarryOver: true,
      }),
    ]);
  });

  test("uses reference-currency running balance for filtered equity", () => {
    const result = deriveLedgerPresentationData({
      account: createAccount({ type: AccountType.EQUITY }),
      bookings: createBookings([
        {
          date: utcDate(2026, 0, 10, 9),
          value: 100,
          valueInReferenceCurrency: 150,
        },
        {
          date: utcDate(2026, 0, 11, 9),
          value: -40,
          valueInReferenceCurrency: -40,
        },
      ]),
      hasPeriodFilter: true,
      balanceBeforePeriodRaw: 0,
      hasBookingsBeforePeriod: false,
      today: utcDate(2026, 0, 11, 12),
    });

    expect(result.rows).toEqual([
      expect.objectContaining({
        date: "11.01.2026",
        referenceCredit: 40,
        balance: -110,
      }),
      expect.objectContaining({
        date: "10.01.2026",
        referenceDebit: 150,
        balance: -150,
      }),
    ]);
  });

  test("nulls filtered equity running balance from the first missing conversion", () => {
    const result = deriveLedgerPresentationData({
      account: createAccount({ type: AccountType.EQUITY }),
      bookings: createBookings([
        {
          date: utcDate(2026, 0, 10, 9),
          value: 100,
          valueInReferenceCurrency: 150,
        },
        {
          date: utcDate(2026, 0, 11, 9),
          value: -40,
          valueInReferenceCurrency: null,
        },
      ]),
      hasPeriodFilter: true,
      balanceBeforePeriodRaw: 0,
      hasBookingsBeforePeriod: false,
      today: utcDate(2026, 0, 11, 12),
    });

    expect(result.rows).toEqual([
      expect.objectContaining({
        date: "11.01.2026",
        referenceCredit: null,
        balance: null,
      }),
      expect.objectContaining({
        date: "10.01.2026",
        referenceDebit: 150,
        balance: -150,
      }),
    ]);
  });

  test("builds chart with end-of-day collapse and today extension", () => {
    const result = deriveLedgerPresentationData({
      account: createAccount({ type: AccountType.ASSET }),
      bookings: createBookings([
        { date: utcDate(2026, 0, 10, 9), value: 100 },
        { date: utcDate(2026, 0, 10, 12), value: -10 },
        { date: utcDate(2026, 0, 10, 15), value: -15 },
        { date: utcDate(2026, 0, 11, 9), value: 5 },
      ]),
      hasPeriodFilter: false,
      balanceBeforePeriodRaw: 0,
      hasBookingsBeforePeriod: false,
      today: utcDate(2026, 0, 12, 12),
    });

    expect(result.balanceChartPoints).toEqual([
      {
        date: "2026-01-10T00:00:00.000Z",
        dateKey: "2026-01-10",
        dateLabel: "10.01.2026",
        balance: 75,
      },
      {
        date: "2026-01-11T00:00:00.000Z",
        dateKey: "2026-01-11",
        dateLabel: "11.01.2026",
        balance: 80,
      },
      {
        date: "2026-01-12T00:00:00.000Z",
        dateKey: "2026-01-12",
        dateLabel: "12.01.2026",
        balance: 80,
      },
    ]);
  });

  test("keeps 2-decimal exactness in running balances for floating-point edge values", () => {
    const result = deriveLedgerPresentationData({
      account: createAccount({ type: AccountType.ASSET }),
      bookings: createBookings([
        { date: utcDate(2026, 0, 10, 9), value: -8439.45 },
        { date: utcDate(2026, 0, 11, 9), value: 9311.0 },
      ]),
      hasPeriodFilter: false,
      balanceBeforePeriodRaw: 0,
      hasBookingsBeforePeriod: false,
      today: utcDate(2026, 0, 11, 12),
    });

    expect(result.rows[0]?.balance).toBe(871.55);
  });
});
