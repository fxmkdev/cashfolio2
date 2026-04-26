import { describe, expect, it, vi } from "vitest";
import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../.prisma-client/enums";
import { computeHoldingGainLossSplit } from "./period-overview-holdings";

const HOLDING_ACCOUNT_ID = "holding-security";
const SECOND_HOLDING_ACCOUNT_ID = "holding-security-2";
const CASH_ACCOUNT_ID = "cash";

const holdingAccounts = [
  {
    id: HOLDING_ACCOUNT_ID,
    unit: Unit.SECURITY,
    currency: null,
    cryptocurrency: null,
    symbol: "AAPL",
    tradeCurrency: "USD",
  },
  {
    id: SECOND_HOLDING_ACCOUNT_ID,
    unit: Unit.SECURITY,
    currency: null,
    cryptocurrency: null,
    symbol: "AAPL",
    tradeCurrency: "USD",
  },
] as const;

function createHoldingBooking(args: {
  id: string;
  date: string;
  value: number;
  accountId?: string;
}) {
  return {
    id: args.id,
    accountId: args.accountId ?? HOLDING_ACCOUNT_ID,
    date: new Date(args.date),
    value: args.value,
    unit: Unit.SECURITY,
    currency: null,
    cryptocurrency: null,
    symbol: "AAPL",
    tradeCurrency: "USD",
    accountType: AccountType.ASSET,
    equityAccountSubtype: null,
  } as const;
}

function createHoldingCurrencyBooking(args: {
  id: string;
  accountId: string;
  date: string;
  value: number;
  currency: string;
}) {
  return {
    id: args.id,
    accountId: args.accountId,
    date: new Date(args.date),
    value: args.value,
    unit: Unit.CURRENCY,
    currency: args.currency,
    cryptocurrency: null,
    symbol: null,
    tradeCurrency: null,
    accountType: AccountType.ASSET,
    equityAccountSubtype: null,
  } as const;
}

function createCashBooking(args: { id: string; date: string; value: number }) {
  return {
    id: args.id,
    accountId: CASH_ACCOUNT_ID,
    date: new Date(args.date),
    value: args.value,
    unit: Unit.CURRENCY,
    currency: "CHF",
    cryptocurrency: null,
    symbol: null,
    tradeCurrency: null,
    accountType: AccountType.ASSET,
    equityAccountSubtype: null,
  } as const;
}

function createExplicitGainLossBooking(args: {
  id: string;
  date: string;
  value: number;
}) {
  return {
    id: args.id,
    accountId: "equity-gainloss",
    date: new Date(args.date),
    value: args.value,
    unit: Unit.CURRENCY,
    currency: "CHF",
    cryptocurrency: null,
    symbol: null,
    tradeCurrency: null,
    accountType: AccountType.EQUITY,
    equityAccountSubtype: EquityAccountSubtype.GAIN_LOSS,
  } as const;
}

describe("period overview holdings FIFO", () => {
  it("seeds opening balance as a lot and computes unrealized gain at period end", async () => {
    const resolveRate = vi.fn().mockImplementation(async ({ date }) => {
      if (date.toISOString() === "2026-01-31T00:00:00.000Z") {
        return 100;
      }
      if (date.toISOString() === "2026-02-28T00:00:00.000Z") {
        return 110;
      }
      return null;
    });

    const result = await computeHoldingGainLossSplit({
      holdingAccounts: [...holdingAccounts],
      initialBalanceByAccountId: new Map([[HOLDING_ACCOUNT_ID, 10]]),
      transactions: [],
      periodStart: new Date("2026-02-01T00:00:00.000Z"),
      periodEndExclusive: new Date("2026-03-01T00:00:00.000Z"),
      initialRateDate: new Date("2026-01-31T00:00:00.000Z"),
      periodEnd: new Date("2026-02-28T00:00:00.000Z"),
      resolveRate,
      convertBookingToReference: vi.fn(),
    });

    expect(result).toEqual({
      realizedGainLoss: 0,
      unrealizedGainLoss: 100,
      convertedCount: 0,
      skippedCount: 0,
    });
  });

  it("applies FIFO matching for partial lot disposal and keeps remaining unrealized", async () => {
    const convertedByBookingId = new Map<string, number>([
      ["h-buy-1", 1000],
      ["c-buy-1", -1000],
      ["h-buy-2", 600],
      ["c-buy-2", -600],
      ["h-sell-1", -1560],
      ["c-sell-1", 1560],
    ]);

    const resolveRate = vi.fn().mockImplementation(async ({ date }) => {
      if (date.toISOString() === "2026-02-28T00:00:00.000Z") {
        return 125;
      }
      return null;
    });

    const result = await computeHoldingGainLossSplit({
      holdingAccounts: [...holdingAccounts],
      initialBalanceByAccountId: new Map(),
      transactions: [
        {
          bookings: [
            createHoldingBooking({
              id: "h-buy-1",
              date: "2026-02-10T00:00:00.000Z",
              value: 10,
            }),
            createCashBooking({
              id: "c-buy-1",
              date: "2026-02-10T00:00:00.000Z",
              value: -1000,
            }),
          ],
        },
        {
          bookings: [
            createHoldingBooking({
              id: "h-buy-2",
              date: "2026-02-11T00:00:00.000Z",
              value: 5,
            }),
            createCashBooking({
              id: "c-buy-2",
              date: "2026-02-11T00:00:00.000Z",
              value: -600,
            }),
          ],
        },
        {
          bookings: [
            createHoldingBooking({
              id: "h-sell-1",
              date: "2026-02-15T00:00:00.000Z",
              value: -12,
            }),
            createCashBooking({
              id: "c-sell-1",
              date: "2026-02-15T00:00:00.000Z",
              value: 1560,
            }),
          ],
        },
      ],
      periodStart: new Date("2026-02-01T00:00:00.000Z"),
      periodEndExclusive: new Date("2026-03-01T00:00:00.000Z"),
      initialRateDate: new Date("2026-01-31T00:00:00.000Z"),
      periodEnd: new Date("2026-02-28T00:00:00.000Z"),
      resolveRate,
      convertBookingToReference: async (booking) =>
        convertedByBookingId.get(booking.id) ?? null,
    });

    expect(result.realizedGainLoss).toBe(320);
    expect(result.unrealizedGainLoss).toBe(15);
    expect(result.convertedCount).toBe(6);
    expect(result.skippedCount).toBe(0);
  });

  it("handles short-lot covering via FIFO", async () => {
    const convertedByBookingId = new Map<string, number>([
      ["h-short-open", -500],
      ["c-short-open", 500],
      ["h-short-cover", 270],
      ["c-short-cover", -270],
    ]);

    const result = await computeHoldingGainLossSplit({
      holdingAccounts: [...holdingAccounts],
      initialBalanceByAccountId: new Map(),
      transactions: [
        {
          bookings: [
            createHoldingBooking({
              id: "h-short-open",
              date: "2026-02-10T00:00:00.000Z",
              value: -5,
            }),
            createCashBooking({
              id: "c-short-open",
              date: "2026-02-10T00:00:00.000Z",
              value: 500,
            }),
          ],
        },
        {
          bookings: [
            createHoldingBooking({
              id: "h-short-cover",
              date: "2026-02-16T00:00:00.000Z",
              value: 3,
            }),
            createCashBooking({
              id: "c-short-cover",
              date: "2026-02-16T00:00:00.000Z",
              value: -270,
            }),
          ],
        },
      ],
      periodStart: new Date("2026-02-01T00:00:00.000Z"),
      periodEndExclusive: new Date("2026-03-01T00:00:00.000Z"),
      initialRateDate: new Date("2026-01-31T00:00:00.000Z"),
      periodEnd: new Date("2026-02-28T00:00:00.000Z"),
      resolveRate: vi.fn().mockResolvedValue(95),
      convertBookingToReference: async (booking) =>
        convertedByBookingId.get(booking.id) ?? null,
    });

    expect(result.realizedGainLoss).toBe(30);
    expect(result.unrealizedGainLoss).toBe(10);
  });

  it("absorbs off-market execution differences into realized gain/loss", async () => {
    const convertedByBookingId = new Map<string, number>([
      ["h-buy", 1000],
      ["c-buy", -1100],
      ["h-sell", -1200],
      ["c-sell", 1180],
    ]);

    const result = await computeHoldingGainLossSplit({
      holdingAccounts: [...holdingAccounts],
      initialBalanceByAccountId: new Map(),
      transactions: [
        {
          bookings: [
            createHoldingBooking({
              id: "h-buy",
              date: "2026-02-10T00:00:00.000Z",
              value: 10,
            }),
            createCashBooking({
              id: "c-buy",
              date: "2026-02-10T00:00:00.000Z",
              value: -1100,
            }),
          ],
        },
        {
          bookings: [
            createHoldingBooking({
              id: "h-sell",
              date: "2026-02-20T00:00:00.000Z",
              value: -10,
            }),
            createCashBooking({
              id: "c-sell",
              date: "2026-02-20T00:00:00.000Z",
              value: 1180,
            }),
          ],
        },
      ],
      periodStart: new Date("2026-02-01T00:00:00.000Z"),
      periodEndExclusive: new Date("2026-03-01T00:00:00.000Z"),
      initialRateDate: new Date("2026-01-31T00:00:00.000Z"),
      periodEnd: new Date("2026-02-28T00:00:00.000Z"),
      resolveRate: vi.fn().mockResolvedValue(120),
      convertBookingToReference: async (booking) =>
        convertedByBookingId.get(booking.id) ?? null,
    });

    expect(result.realizedGainLoss).toBe(80);
    expect(result.unrealizedGainLoss).toBe(0);
  });

  it("falls back to market conversion when counterpart conversion is missing", async () => {
    const convertedByBookingId = new Map<string, number | null>([
      ["h-buy", 200],
      ["c-buy", null],
    ]);

    const result = await computeHoldingGainLossSplit({
      holdingAccounts: [...holdingAccounts],
      initialBalanceByAccountId: new Map(),
      transactions: [
        {
          bookings: [
            createHoldingBooking({
              id: "h-buy",
              date: "2026-02-10T00:00:00.000Z",
              value: 2,
            }),
            createCashBooking({
              id: "c-buy",
              date: "2026-02-10T00:00:00.000Z",
              value: -250,
            }),
          ],
        },
      ],
      periodStart: new Date("2026-02-01T00:00:00.000Z"),
      periodEndExclusive: new Date("2026-03-01T00:00:00.000Z"),
      initialRateDate: new Date("2026-01-31T00:00:00.000Z"),
      periodEnd: new Date("2026-02-28T00:00:00.000Z"),
      resolveRate: vi.fn().mockResolvedValue(100),
      convertBookingToReference: async (booking) =>
        convertedByBookingId.get(booking.id) ?? null,
    });

    expect(result).toEqual({
      realizedGainLoss: 0,
      unrealizedGainLoss: 0,
      convertedCount: 1,
      skippedCount: 1,
    });
  });

  it("uses straddled counterpart legs outside period for execution pricing", async () => {
    const convertedByBookingId = new Map<string, number>([
      ["h-buy", 100],
      ["c-buy-before-period", -120],
    ]);

    const result = await computeHoldingGainLossSplit({
      holdingAccounts: [holdingAccounts[0]],
      initialBalanceByAccountId: new Map(),
      transactions: [
        {
          bookings: [
            createHoldingBooking({
              id: "h-buy",
              date: "2026-02-01T00:00:00.000Z",
              value: 1,
            }),
            createCashBooking({
              id: "c-buy-before-period",
              date: "2026-01-31T00:00:00.000Z",
              value: -120,
            }),
          ],
        },
      ],
      periodStart: new Date("2026-02-01T00:00:00.000Z"),
      periodEndExclusive: new Date("2026-03-01T00:00:00.000Z"),
      initialRateDate: new Date("2026-01-31T00:00:00.000Z"),
      periodEnd: new Date("2026-02-28T00:00:00.000Z"),
      resolveRate: vi.fn().mockResolvedValue(110),
      convertBookingToReference: async (booking) =>
        convertedByBookingId.get(booking.id) ?? null,
    });

    expect(result).toEqual({
      realizedGainLoss: 0,
      unrealizedGainLoss: -10,
      convertedCount: 2,
      skippedCount: 0,
    });
  });

  it("allocates all-holding residual for multi-unit exchanges", async () => {
    const eurAccountId = "holding-eur";
    const usdAccountId = "holding-usd";
    const convertedByBookingId = new Map<string, number>([
      ["h-sell-eur", -96],
      ["h-buy-usd", 100],
    ]);

    const result = await computeHoldingGainLossSplit({
      holdingAccounts: [
        {
          id: eurAccountId,
          unit: Unit.CURRENCY,
          currency: "EUR",
          cryptocurrency: null,
          symbol: null,
          tradeCurrency: null,
        },
        {
          id: usdAccountId,
          unit: Unit.CURRENCY,
          currency: "USD",
          cryptocurrency: null,
          symbol: null,
          tradeCurrency: null,
        },
      ],
      initialBalanceByAccountId: new Map([[eurAccountId, 80]]),
      transactions: [
        {
          bookings: [
            createHoldingCurrencyBooking({
              id: "h-sell-eur",
              accountId: eurAccountId,
              date: "2026-02-10T00:00:00.000Z",
              value: -80,
              currency: "EUR",
            }),
            createHoldingCurrencyBooking({
              id: "h-buy-usd",
              accountId: usdAccountId,
              date: "2026-02-10T00:00:00.000Z",
              value: 100,
              currency: "USD",
            }),
          ],
        },
      ],
      periodStart: new Date("2026-02-01T00:00:00.000Z"),
      periodEndExclusive: new Date("2026-03-01T00:00:00.000Z"),
      initialRateDate: new Date("2026-01-31T00:00:00.000Z"),
      periodEnd: new Date("2026-02-28T00:00:00.000Z"),
      resolveRate: vi.fn().mockImplementation(async ({ date, currency }) => {
        if (
          currency === "EUR" &&
          date.toISOString() === "2026-01-31T00:00:00.000Z"
        ) {
          return 1;
        }
        if (
          currency === "USD" &&
          date.toISOString() === "2026-02-28T00:00:00.000Z"
        ) {
          return 1;
        }
        if (
          currency === "EUR" &&
          date.toISOString() === "2026-02-28T00:00:00.000Z"
        ) {
          return 1;
        }
        return null;
      }),
      convertBookingToReference: async (booking) =>
        convertedByBookingId.get(booking.id) ?? null,
    });

    expect(result.convertedCount).toBe(2);
    expect(result.skippedCount).toBe(0);
    expect(result.realizedGainLoss).toBeCloseTo(17.9591836735, 9);
    expect(result.unrealizedGainLoss).toBeCloseTo(2.0408163265, 9);
  });

  it("transfers holding lots across accounts without realizing gain/loss", async () => {
    const convertedByBookingId = new Map<string, number>([
      ["h-transfer-out", -440],
      ["h-transfer-in", 440],
    ]);

    const result = await computeHoldingGainLossSplit({
      holdingAccounts: [...holdingAccounts],
      initialBalanceByAccountId: new Map([[HOLDING_ACCOUNT_ID, 10]]),
      transactions: [
        {
          bookings: [
            createHoldingBooking({
              id: "h-transfer-out",
              accountId: HOLDING_ACCOUNT_ID,
              date: "2026-02-10T00:00:00.000Z",
              value: -4,
            }),
            createHoldingBooking({
              id: "h-transfer-in",
              accountId: SECOND_HOLDING_ACCOUNT_ID,
              date: "2026-02-10T00:00:00.000Z",
              value: 4,
            }),
          ],
        },
      ],
      periodStart: new Date("2026-02-01T00:00:00.000Z"),
      periodEndExclusive: new Date("2026-03-01T00:00:00.000Z"),
      initialRateDate: new Date("2026-01-31T00:00:00.000Z"),
      periodEnd: new Date("2026-02-28T00:00:00.000Z"),
      resolveRate: vi.fn().mockImplementation(async ({ date }) => {
        if (date.toISOString() === "2026-01-31T00:00:00.000Z") {
          return 100;
        }
        return 110;
      }),
      convertBookingToReference: async (booking) =>
        convertedByBookingId.get(booking.id) ?? null,
    });

    expect(result).toEqual({
      realizedGainLoss: 0,
      unrealizedGainLoss: 100,
      convertedCount: 0,
      skippedCount: 0,
    });
  });

  it("preserves FIFO lot order for transferred lots in destination accounts", async () => {
    const convertedByBookingId = new Map<string, number>([
      ["h-destination-buy", 200],
      ["c-destination-buy", -200],
      ["h-destination-sell", -150],
      ["c-destination-sell", 150],
    ]);

    const result = await computeHoldingGainLossSplit({
      holdingAccounts: [...holdingAccounts],
      initialBalanceByAccountId: new Map([[HOLDING_ACCOUNT_ID, 1]]),
      transactions: [
        {
          bookings: [
            createHoldingBooking({
              id: "h-destination-buy",
              accountId: SECOND_HOLDING_ACCOUNT_ID,
              date: "2026-02-05T00:00:00.000Z",
              value: 1,
            }),
            createCashBooking({
              id: "c-destination-buy",
              date: "2026-02-05T00:00:00.000Z",
              value: -200,
            }),
          ],
        },
        {
          bookings: [
            createHoldingBooking({
              id: "h-transfer-out-fifo-order",
              accountId: HOLDING_ACCOUNT_ID,
              date: "2026-02-10T00:00:00.000Z",
              value: -1,
            }),
            createHoldingBooking({
              id: "h-transfer-in-fifo-order",
              accountId: SECOND_HOLDING_ACCOUNT_ID,
              date: "2026-02-10T00:00:00.000Z",
              value: 1,
            }),
          ],
        },
        {
          bookings: [
            createHoldingBooking({
              id: "h-destination-sell",
              accountId: SECOND_HOLDING_ACCOUNT_ID,
              date: "2026-02-20T00:00:00.000Z",
              value: -1,
            }),
            createCashBooking({
              id: "c-destination-sell",
              date: "2026-02-20T00:00:00.000Z",
              value: 150,
            }),
          ],
        },
      ],
      periodStart: new Date("2026-02-01T00:00:00.000Z"),
      periodEndExclusive: new Date("2026-03-01T00:00:00.000Z"),
      initialRateDate: new Date("2026-01-31T00:00:00.000Z"),
      periodEnd: new Date("2026-02-28T00:00:00.000Z"),
      resolveRate: vi.fn().mockImplementation(async ({ date }) => {
        if (date.toISOString() === "2026-01-31T00:00:00.000Z") {
          return 100;
        }
        return 200;
      }),
      convertBookingToReference: async (booking) =>
        convertedByBookingId.get(booking.id) ?? null,
    });

    expect(result).toEqual({
      realizedGainLoss: 50,
      unrealizedGainLoss: 0,
      convertedCount: 4,
      skippedCount: 0,
    });
  });

  it("transfers short lots across accounts without realizing gain/loss", async () => {
    const convertedByBookingId = new Map<string, number>([
      ["h-short-transfer-out", 360],
      ["h-short-transfer-in", -360],
    ]);

    const result = await computeHoldingGainLossSplit({
      holdingAccounts: [...holdingAccounts],
      initialBalanceByAccountId: new Map([[HOLDING_ACCOUNT_ID, -10]]),
      transactions: [
        {
          bookings: [
            createHoldingBooking({
              id: "h-short-transfer-out",
              accountId: HOLDING_ACCOUNT_ID,
              date: "2026-02-10T00:00:00.000Z",
              value: 4,
            }),
            createHoldingBooking({
              id: "h-short-transfer-in",
              accountId: SECOND_HOLDING_ACCOUNT_ID,
              date: "2026-02-10T00:00:00.000Z",
              value: -4,
            }),
          ],
        },
      ],
      periodStart: new Date("2026-02-01T00:00:00.000Z"),
      periodEndExclusive: new Date("2026-03-01T00:00:00.000Z"),
      initialRateDate: new Date("2026-01-31T00:00:00.000Z"),
      periodEnd: new Date("2026-02-28T00:00:00.000Z"),
      resolveRate: vi.fn().mockImplementation(async ({ date }) => {
        if (date.toISOString() === "2026-01-31T00:00:00.000Z") {
          return 100;
        }
        return 90;
      }),
      convertBookingToReference: async (booking) =>
        convertedByBookingId.get(booking.id) ?? null,
    });

    expect(result).toEqual({
      realizedGainLoss: 0,
      unrealizedGainLoss: 100,
      convertedCount: 0,
      skippedCount: 0,
    });
  });

  it("falls back to execution pricing when short-transfer source is insufficient", async () => {
    const convertedByBookingId = new Map<string, number>([
      ["h-short-transfer-out-insufficient", 400],
      ["h-short-transfer-in-insufficient", -400],
    ]);

    const result = await computeHoldingGainLossSplit({
      holdingAccounts: [...holdingAccounts],
      initialBalanceByAccountId: new Map([[HOLDING_ACCOUNT_ID, -2]]),
      transactions: [
        {
          bookings: [
            createHoldingBooking({
              id: "h-short-transfer-out-insufficient",
              accountId: HOLDING_ACCOUNT_ID,
              date: "2026-02-10T00:00:00.000Z",
              value: 4,
            }),
            createHoldingBooking({
              id: "h-short-transfer-in-insufficient",
              accountId: SECOND_HOLDING_ACCOUNT_ID,
              date: "2026-02-10T00:00:00.000Z",
              value: -4,
            }),
          ],
        },
      ],
      periodStart: new Date("2026-02-01T00:00:00.000Z"),
      periodEndExclusive: new Date("2026-03-01T00:00:00.000Z"),
      initialRateDate: new Date("2026-01-31T00:00:00.000Z"),
      periodEnd: new Date("2026-02-28T00:00:00.000Z"),
      resolveRate: vi.fn().mockResolvedValue(100),
      convertBookingToReference: async (booking) =>
        convertedByBookingId.get(booking.id) ?? null,
    });

    expect(result).toEqual({
      realizedGainLoss: 0,
      unrealizedGainLoss: 0,
      convertedCount: 2,
      skippedCount: 0,
    });
  });

  it("treats mixed-period same-unit holding transfers as non-realizing carry-outs", async () => {
    const convertedByBookingId = new Map<string, number>([
      ["h-carry-out", -440],
    ]);

    const result = await computeHoldingGainLossSplit({
      holdingAccounts: [...holdingAccounts],
      initialBalanceByAccountId: new Map([
        [HOLDING_ACCOUNT_ID, 10],
        [SECOND_HOLDING_ACCOUNT_ID, 4],
      ]),
      transactions: [
        {
          bookings: [
            createHoldingBooking({
              id: "h-carry-in-before-period",
              accountId: SECOND_HOLDING_ACCOUNT_ID,
              date: "2026-01-31T00:00:00.000Z",
              value: 4,
            }),
            createHoldingBooking({
              id: "h-carry-out",
              accountId: HOLDING_ACCOUNT_ID,
              date: "2026-02-01T00:00:00.000Z",
              value: -4,
            }),
          ],
        },
      ],
      periodStart: new Date("2026-02-01T00:00:00.000Z"),
      periodEndExclusive: new Date("2026-03-01T00:00:00.000Z"),
      initialRateDate: new Date("2026-01-31T00:00:00.000Z"),
      periodEnd: new Date("2026-02-28T00:00:00.000Z"),
      resolveRate: vi.fn().mockImplementation(async ({ date }) => {
        if (date.toISOString() === "2026-01-31T00:00:00.000Z") {
          return 100;
        }
        return 120;
      }),
      convertBookingToReference: async (booking) =>
        convertedByBookingId.get(booking.id) ?? null,
    });

    expect(result).toEqual({
      realizedGainLoss: 0,
      unrealizedGainLoss: 200,
      convertedCount: 1,
      skippedCount: 0,
    });
  });

  it("skips mixed-period same-unit holding transfers when carry conversion is missing", async () => {
    const result = await computeHoldingGainLossSplit({
      holdingAccounts: [...holdingAccounts],
      initialBalanceByAccountId: new Map([
        [HOLDING_ACCOUNT_ID, 10],
        [SECOND_HOLDING_ACCOUNT_ID, 4],
      ]),
      transactions: [
        {
          bookings: [
            createHoldingBooking({
              id: "h-carry-in-before-period",
              accountId: SECOND_HOLDING_ACCOUNT_ID,
              date: "2026-01-31T00:00:00.000Z",
              value: 4,
            }),
            createHoldingBooking({
              id: "h-carry-out",
              accountId: HOLDING_ACCOUNT_ID,
              date: "2026-02-01T00:00:00.000Z",
              value: -4,
            }),
          ],
        },
      ],
      periodStart: new Date("2026-02-01T00:00:00.000Z"),
      periodEndExclusive: new Date("2026-03-01T00:00:00.000Z"),
      initialRateDate: new Date("2026-01-31T00:00:00.000Z"),
      periodEnd: new Date("2026-02-28T00:00:00.000Z"),
      resolveRate: vi.fn().mockImplementation(async ({ date }) => {
        if (date.toISOString() === "2026-01-31T00:00:00.000Z") {
          return 100;
        }
        return 120;
      }),
      convertBookingToReference: async (booking) =>
        booking.id === "h-carry-out" ? null : 0,
    });

    expect(result).toEqual({
      realizedGainLoss: 0,
      unrealizedGainLoss: 280,
      convertedCount: 0,
      skippedCount: 1,
    });
  });

  it("allocates residual by quantity when holding market values are zero", async () => {
    const convertedByBookingId = new Map<string, number>([
      ["h-a", 0],
      ["h-b", 0],
      ["c-total", -300],
    ]);

    const result = await computeHoldingGainLossSplit({
      holdingAccounts: [...holdingAccounts],
      initialBalanceByAccountId: new Map(),
      transactions: [
        {
          bookings: [
            createHoldingBooking({
              id: "h-a",
              date: "2026-02-10T00:00:00.000Z",
              value: 2,
            }),
            createHoldingBooking({
              id: "h-b",
              date: "2026-02-10T00:00:00.000Z",
              value: 1,
            }),
            createCashBooking({
              id: "c-total",
              date: "2026-02-10T00:00:00.000Z",
              value: -300,
            }),
          ],
        },
      ],
      periodStart: new Date("2026-02-01T00:00:00.000Z"),
      periodEndExclusive: new Date("2026-03-01T00:00:00.000Z"),
      initialRateDate: new Date("2026-01-31T00:00:00.000Z"),
      periodEnd: new Date("2026-02-28T00:00:00.000Z"),
      resolveRate: vi.fn().mockResolvedValue(100),
      convertBookingToReference: async (booking) =>
        convertedByBookingId.get(booking.id) ?? null,
    });

    expect(result).toEqual({
      realizedGainLoss: 0,
      unrealizedGainLoss: 0,
      convertedCount: 3,
      skippedCount: 0,
    });
  });

  it("uses equal residual allocation when both market values and quantities are zero", async () => {
    const convertedByBookingId = new Map<string, number>([
      ["h-zero-a", 0],
      ["h-zero-b", 0],
      ["c-total", -200],
    ]);

    const result = await computeHoldingGainLossSplit({
      holdingAccounts: [...holdingAccounts],
      initialBalanceByAccountId: new Map(),
      transactions: [
        {
          bookings: [
            createHoldingBooking({
              id: "h-zero-a",
              date: "2026-02-10T00:00:00.000Z",
              value: 0,
            }),
            createHoldingBooking({
              id: "h-zero-b",
              date: "2026-02-10T00:00:00.000Z",
              value: 0,
            }),
            createCashBooking({
              id: "c-total",
              date: "2026-02-10T00:00:00.000Z",
              value: -200,
            }),
          ],
        },
      ],
      periodStart: new Date("2026-02-01T00:00:00.000Z"),
      periodEndExclusive: new Date("2026-03-01T00:00:00.000Z"),
      initialRateDate: new Date("2026-01-31T00:00:00.000Z"),
      periodEnd: new Date("2026-02-28T00:00:00.000Z"),
      resolveRate: vi.fn().mockResolvedValue(100),
      convertBookingToReference: async (booking) =>
        convertedByBookingId.get(booking.id) ?? null,
    });

    expect(result).toEqual({
      realizedGainLoss: 0,
      unrealizedGainLoss: 0,
      convertedCount: 3,
      skippedCount: 0,
    });
  });

  it("excludes explicit gain/loss equity bookings from execution price allocation", async () => {
    const convertedByBookingId = new Map<string, number>([
      ["h-sell", -110],
      ["c-sell", 120],
      ["e-gainloss", -10],
    ]);

    const resolveRate = vi.fn().mockImplementation(async ({ date }) => {
      if (date.toISOString() === "2026-01-31T00:00:00.000Z") {
        return 100;
      }
      return 120;
    });

    const result = await computeHoldingGainLossSplit({
      holdingAccounts: [...holdingAccounts],
      initialBalanceByAccountId: new Map([[HOLDING_ACCOUNT_ID, 1]]),
      transactions: [
        {
          bookings: [
            createHoldingBooking({
              id: "h-sell",
              date: "2026-02-10T00:00:00.000Z",
              value: -1,
            }),
            createCashBooking({
              id: "c-sell",
              date: "2026-02-10T00:00:00.000Z",
              value: 120,
            }),
            createExplicitGainLossBooking({
              id: "e-gainloss",
              date: "2026-02-10T00:00:00.000Z",
              value: -10,
            }),
          ],
        },
      ],
      periodStart: new Date("2026-02-01T00:00:00.000Z"),
      periodEndExclusive: new Date("2026-03-01T00:00:00.000Z"),
      initialRateDate: new Date("2026-01-31T00:00:00.000Z"),
      periodEnd: new Date("2026-02-28T00:00:00.000Z"),
      resolveRate,
      convertBookingToReference: async (booking) =>
        convertedByBookingId.get(booking.id) ?? null,
    });

    expect(result.realizedGainLoss).toBe(20);
    expect(result.unrealizedGainLoss).toBe(0);
    expect(result.convertedCount).toBe(2);
    expect(result.skippedCount).toBe(0);
  });

  it("skips holding contribution when opening balance exists but initial rate is unavailable", async () => {
    const result = await computeHoldingGainLossSplit({
      holdingAccounts: [...holdingAccounts],
      initialBalanceByAccountId: new Map([[HOLDING_ACCOUNT_ID, 10]]),
      transactions: [],
      periodStart: new Date("2026-02-01T00:00:00.000Z"),
      periodEndExclusive: new Date("2026-03-01T00:00:00.000Z"),
      initialRateDate: new Date("2026-01-31T00:00:00.000Z"),
      periodEnd: new Date("2026-02-28T00:00:00.000Z"),
      resolveRate: vi.fn().mockResolvedValue(null),
      convertBookingToReference: vi.fn(),
    });

    expect(result).toEqual({
      realizedGainLoss: 0,
      unrealizedGainLoss: 0,
      convertedCount: 0,
      skippedCount: 1,
    });
  });
});
