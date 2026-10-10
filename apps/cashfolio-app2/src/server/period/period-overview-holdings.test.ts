import type { MoneyInput, Money } from "../../shared/money";
import { toMoney } from "../../shared/money";
import { toNumericMoney } from "../money-boundary";
import { describe, expect, it, vi } from "vitest";
import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../../.prisma-client/enums";
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
  value: MoneyInput;
  accountId?: string;
}) {
  return {
    id: args.id,
    accountId: args.accountId ?? HOLDING_ACCOUNT_ID,
    date: new Date(args.date),
    value: toMoney(args.value),
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
  value: MoneyInput;
  currency: string;
}) {
  return {
    id: args.id,
    accountId: args.accountId,
    date: new Date(args.date),
    value: toMoney(args.value),
    unit: Unit.CURRENCY,
    currency: args.currency,
    cryptocurrency: null,
    symbol: null,
    tradeCurrency: null,
    accountType: AccountType.ASSET,
    equityAccountSubtype: null,
  } as const;
}

function createCashBooking(args: {
  id: string;
  date: string;
  value: MoneyInput;
}) {
  return {
    id: args.id,
    accountId: CASH_ACCOUNT_ID,
    date: new Date(args.date),
    value: toMoney(args.value),
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
  value: MoneyInput;
}) {
  return {
    id: args.id,
    accountId: "equity-gainloss",
    date: new Date(args.date),
    value: toMoney(args.value),
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
        return toMoney(100);
      }
      if (date.toISOString() === "2026-02-28T00:00:00.000Z") {
        return toMoney(110);
      }
      return null;
    });

    const result = await computeHoldingGainLossSplit({
      holdingAccounts: [...holdingAccounts],
      initialBalanceByAccountId: new Map([[HOLDING_ACCOUNT_ID, toMoney(10)]]),
      transactions: [],
      periodStart: new Date("2026-02-01T00:00:00.000Z"),
      periodEndExclusive: new Date("2026-03-01T00:00:00.000Z"),
      initialRateDate: new Date("2026-01-31T00:00:00.000Z"),
      periodEnd: new Date("2026-02-28T00:00:00.000Z"),
      resolveRate,
      convertBookingToReference: vi.fn(),
    });

    expect(toNumericMoney(result)).toEqual({
      realizedGainLoss: 0,
      unrealizedGainLoss: 100,
      convertedCount: 0,
      skippedCount: 0,
    });
  });

  it("applies FIFO matching for partial lot disposal and keeps remaining unrealized", async () => {
    const convertedByBookingId = new Map<string, Money>([
      ["h-buy-1", toMoney(1000)],
      ["c-buy-1", toMoney(-1000)],
      ["h-buy-2", toMoney(600)],
      ["c-buy-2", toMoney(-600)],
      ["h-sell-1", toMoney(-1560)],
      ["c-sell-1", toMoney(1560)],
    ]);

    const resolveRate = vi.fn().mockImplementation(async ({ date }) => {
      if (date.toISOString() === "2026-02-28T00:00:00.000Z") {
        return toMoney(125);
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
              value: toMoney(10),
            }),
            createCashBooking({
              id: "c-buy-1",
              date: "2026-02-10T00:00:00.000Z",
              value: toMoney(-1000),
            }),
          ],
        },
        {
          bookings: [
            createHoldingBooking({
              id: "h-buy-2",
              date: "2026-02-11T00:00:00.000Z",
              value: toMoney(5),
            }),
            createCashBooking({
              id: "c-buy-2",
              date: "2026-02-11T00:00:00.000Z",
              value: toMoney(-600),
            }),
          ],
        },
        {
          bookings: [
            createHoldingBooking({
              id: "h-sell-1",
              date: "2026-02-15T00:00:00.000Z",
              value: toMoney(-12),
            }),
            createCashBooking({
              id: "c-sell-1",
              date: "2026-02-15T00:00:00.000Z",
              value: toMoney(1560),
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

    expect(toNumericMoney(result.realizedGainLoss)).toBe(320);
    expect(toNumericMoney(result.unrealizedGainLoss)).toBe(15);
    expect(result.convertedCount).toBe(6);
    expect(result.skippedCount).toBe(0);
  });

  it("handles short-lot covering via FIFO", async () => {
    const convertedByBookingId = new Map<string, Money>([
      ["h-short-open", toMoney(-500)],
      ["c-short-open", toMoney(500)],
      ["h-short-cover", toMoney(270)],
      ["c-short-cover", toMoney(-270)],
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
              value: toMoney(-5),
            }),
            createCashBooking({
              id: "c-short-open",
              date: "2026-02-10T00:00:00.000Z",
              value: toMoney(500),
            }),
          ],
        },
        {
          bookings: [
            createHoldingBooking({
              id: "h-short-cover",
              date: "2026-02-16T00:00:00.000Z",
              value: toMoney(3),
            }),
            createCashBooking({
              id: "c-short-cover",
              date: "2026-02-16T00:00:00.000Z",
              value: toMoney(-270),
            }),
          ],
        },
      ],
      periodStart: new Date("2026-02-01T00:00:00.000Z"),
      periodEndExclusive: new Date("2026-03-01T00:00:00.000Z"),
      initialRateDate: new Date("2026-01-31T00:00:00.000Z"),
      periodEnd: new Date("2026-02-28T00:00:00.000Z"),
      resolveRate: vi.fn().mockResolvedValue(toMoney(95)),
      convertBookingToReference: async (booking) =>
        convertedByBookingId.get(booking.id) ?? null,
    });

    expect(toNumericMoney(result.realizedGainLoss)).toBe(30);
    expect(toNumericMoney(result.unrealizedGainLoss)).toBe(10);
  });

  it("absorbs off-market execution differences into realized gain/loss", async () => {
    const convertedByBookingId = new Map<string, Money>([
      ["h-buy", toMoney(1000)],
      ["c-buy", toMoney(-1100)],
      ["h-sell", toMoney(-1200)],
      ["c-sell", toMoney(1180)],
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
              value: toMoney(10),
            }),
            createCashBooking({
              id: "c-buy",
              date: "2026-02-10T00:00:00.000Z",
              value: toMoney(-1100),
            }),
          ],
        },
        {
          bookings: [
            createHoldingBooking({
              id: "h-sell",
              date: "2026-02-20T00:00:00.000Z",
              value: toMoney(-10),
            }),
            createCashBooking({
              id: "c-sell",
              date: "2026-02-20T00:00:00.000Z",
              value: toMoney(1180),
            }),
          ],
        },
      ],
      periodStart: new Date("2026-02-01T00:00:00.000Z"),
      periodEndExclusive: new Date("2026-03-01T00:00:00.000Z"),
      initialRateDate: new Date("2026-01-31T00:00:00.000Z"),
      periodEnd: new Date("2026-02-28T00:00:00.000Z"),
      resolveRate: vi.fn().mockResolvedValue(toMoney(120)),
      convertBookingToReference: async (booking) =>
        convertedByBookingId.get(booking.id) ?? null,
    });

    expect(toNumericMoney(result.realizedGainLoss)).toBe(80);
    expect(toNumericMoney(result.unrealizedGainLoss)).toBe(0);
  });

  it("falls back to market conversion when counterpart conversion is missing", async () => {
    const convertedByBookingId = new Map<string, Money | null>([
      ["h-buy", toMoney(200)],
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
              value: toMoney(2),
            }),
            createCashBooking({
              id: "c-buy",
              date: "2026-02-10T00:00:00.000Z",
              value: toMoney(-250),
            }),
          ],
        },
      ],
      periodStart: new Date("2026-02-01T00:00:00.000Z"),
      periodEndExclusive: new Date("2026-03-01T00:00:00.000Z"),
      initialRateDate: new Date("2026-01-31T00:00:00.000Z"),
      periodEnd: new Date("2026-02-28T00:00:00.000Z"),
      resolveRate: vi.fn().mockResolvedValue(toMoney(100)),
      convertBookingToReference: async (booking) =>
        convertedByBookingId.get(booking.id) ?? null,
    });

    expect(toNumericMoney(result)).toEqual({
      realizedGainLoss: 0,
      unrealizedGainLoss: 0,
      convertedCount: 1,
      skippedCount: 1,
    });
  });

  it("uses straddled counterpart legs outside period for execution pricing", async () => {
    const convertedByBookingId = new Map<string, Money>([
      ["h-buy", toMoney(100)],
      ["c-buy-before-period", toMoney(-120)],
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
              value: toMoney(1),
            }),
            createCashBooking({
              id: "c-buy-before-period",
              date: "2026-01-31T00:00:00.000Z",
              value: toMoney(-120),
            }),
          ],
        },
      ],
      periodStart: new Date("2026-02-01T00:00:00.000Z"),
      periodEndExclusive: new Date("2026-03-01T00:00:00.000Z"),
      initialRateDate: new Date("2026-01-31T00:00:00.000Z"),
      periodEnd: new Date("2026-02-28T00:00:00.000Z"),
      resolveRate: vi.fn().mockResolvedValue(toMoney(110)),
      convertBookingToReference: async (booking) =>
        convertedByBookingId.get(booking.id) ?? null,
    });

    expect(toNumericMoney(result)).toEqual({
      realizedGainLoss: 0,
      unrealizedGainLoss: -10,
      convertedCount: 2,
      skippedCount: 0,
    });
  });

  it("allocates all-holding residual for multi-unit exchanges", async () => {
    const eurAccountId = "holding-eur";
    const usdAccountId = "holding-usd";
    const convertedByBookingId = new Map<string, Money>([
      ["h-sell-eur", toMoney(-96)],
      ["h-buy-usd", toMoney(100)],
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
      initialBalanceByAccountId: new Map([[eurAccountId, toMoney(80)]]),
      transactions: [
        {
          bookings: [
            createHoldingCurrencyBooking({
              id: "h-sell-eur",
              accountId: eurAccountId,
              date: "2026-02-10T00:00:00.000Z",
              value: toMoney(-80),
              currency: "EUR",
            }),
            createHoldingCurrencyBooking({
              id: "h-buy-usd",
              accountId: usdAccountId,
              date: "2026-02-10T00:00:00.000Z",
              value: toMoney(100),
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
          return toMoney(1);
        }
        if (
          currency === "USD" &&
          date.toISOString() === "2026-02-28T00:00:00.000Z"
        ) {
          return toMoney(1);
        }
        if (
          currency === "EUR" &&
          date.toISOString() === "2026-02-28T00:00:00.000Z"
        ) {
          return toMoney(1);
        }
        return null;
      }),
      convertBookingToReference: async (booking) =>
        convertedByBookingId.get(booking.id) ?? null,
    });

    expect(result.convertedCount).toBe(2);
    expect(result.skippedCount).toBe(0);
    expect(toNumericMoney(result.realizedGainLoss)).toBeCloseTo(
      17.9591836735,
      9,
    );
    expect(toNumericMoney(result.unrealizedGainLoss)).toBeCloseTo(
      2.0408163265,
      9,
    );
  });

  it("transfers holding lots across accounts without realizing gain/loss", async () => {
    const convertedByBookingId = new Map<string, Money>([
      ["h-transfer-out", toMoney(-440)],
      ["h-transfer-in", toMoney(440)],
    ]);

    const result = await computeHoldingGainLossSplit({
      holdingAccounts: [...holdingAccounts],
      initialBalanceByAccountId: new Map([[HOLDING_ACCOUNT_ID, toMoney(10)]]),
      transactions: [
        {
          bookings: [
            createHoldingBooking({
              id: "h-transfer-out",
              accountId: HOLDING_ACCOUNT_ID,
              date: "2026-02-10T00:00:00.000Z",
              value: toMoney(-4),
            }),
            createHoldingBooking({
              id: "h-transfer-in",
              accountId: SECOND_HOLDING_ACCOUNT_ID,
              date: "2026-02-10T00:00:00.000Z",
              value: toMoney(4),
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
          return toMoney(100);
        }
        return toMoney(110);
      }),
      convertBookingToReference: async (booking) =>
        convertedByBookingId.get(booking.id) ?? null,
    });

    expect(toNumericMoney(result)).toEqual({
      realizedGainLoss: 0,
      unrealizedGainLoss: 100,
      convertedCount: 0,
      skippedCount: 0,
    });
  });

  it("preserves FIFO lot order for transferred lots in destination accounts", async () => {
    const convertedByBookingId = new Map<string, Money>([
      ["h-destination-buy", toMoney(200)],
      ["c-destination-buy", toMoney(-200)],
      ["h-destination-sell", toMoney(-150)],
      ["c-destination-sell", toMoney(150)],
    ]);

    const result = await computeHoldingGainLossSplit({
      holdingAccounts: [...holdingAccounts],
      initialBalanceByAccountId: new Map([[HOLDING_ACCOUNT_ID, toMoney(1)]]),
      transactions: [
        {
          bookings: [
            createHoldingBooking({
              id: "h-destination-buy",
              accountId: SECOND_HOLDING_ACCOUNT_ID,
              date: "2026-02-05T00:00:00.000Z",
              value: toMoney(1),
            }),
            createCashBooking({
              id: "c-destination-buy",
              date: "2026-02-05T00:00:00.000Z",
              value: toMoney(-200),
            }),
          ],
        },
        {
          bookings: [
            createHoldingBooking({
              id: "h-transfer-out-fifo-order",
              accountId: HOLDING_ACCOUNT_ID,
              date: "2026-02-10T00:00:00.000Z",
              value: toMoney(-1),
            }),
            createHoldingBooking({
              id: "h-transfer-in-fifo-order",
              accountId: SECOND_HOLDING_ACCOUNT_ID,
              date: "2026-02-10T00:00:00.000Z",
              value: toMoney(1),
            }),
          ],
        },
        {
          bookings: [
            createHoldingBooking({
              id: "h-destination-sell",
              accountId: SECOND_HOLDING_ACCOUNT_ID,
              date: "2026-02-20T00:00:00.000Z",
              value: toMoney(-1),
            }),
            createCashBooking({
              id: "c-destination-sell",
              date: "2026-02-20T00:00:00.000Z",
              value: toMoney(150),
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
          return toMoney(100);
        }
        return toMoney(200);
      }),
      convertBookingToReference: async (booking) =>
        convertedByBookingId.get(booking.id) ?? null,
    });

    expect(toNumericMoney(result)).toEqual({
      realizedGainLoss: 50,
      unrealizedGainLoss: 0,
      convertedCount: 4,
      skippedCount: 0,
    });
  });

  it("transfers short lots across accounts without realizing gain/loss", async () => {
    const convertedByBookingId = new Map<string, Money>([
      ["h-short-transfer-out", toMoney(360)],
      ["h-short-transfer-in", toMoney(-360)],
    ]);

    const result = await computeHoldingGainLossSplit({
      holdingAccounts: [...holdingAccounts],
      initialBalanceByAccountId: new Map([[HOLDING_ACCOUNT_ID, toMoney(-10)]]),
      transactions: [
        {
          bookings: [
            createHoldingBooking({
              id: "h-short-transfer-out",
              accountId: HOLDING_ACCOUNT_ID,
              date: "2026-02-10T00:00:00.000Z",
              value: toMoney(4),
            }),
            createHoldingBooking({
              id: "h-short-transfer-in",
              accountId: SECOND_HOLDING_ACCOUNT_ID,
              date: "2026-02-10T00:00:00.000Z",
              value: toMoney(-4),
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
          return toMoney(100);
        }
        return toMoney(90);
      }),
      convertBookingToReference: async (booking) =>
        convertedByBookingId.get(booking.id) ?? null,
    });

    expect(toNumericMoney(result)).toEqual({
      realizedGainLoss: 0,
      unrealizedGainLoss: 100,
      convertedCount: 0,
      skippedCount: 0,
    });
  });

  it("falls back to execution pricing when short-transfer source is insufficient", async () => {
    const convertedByBookingId = new Map<string, Money>([
      ["h-short-transfer-out-insufficient", toMoney(400)],
      ["h-short-transfer-in-insufficient", toMoney(-400)],
    ]);

    const result = await computeHoldingGainLossSplit({
      holdingAccounts: [...holdingAccounts],
      initialBalanceByAccountId: new Map([[HOLDING_ACCOUNT_ID, toMoney(-2)]]),
      transactions: [
        {
          bookings: [
            createHoldingBooking({
              id: "h-short-transfer-out-insufficient",
              accountId: HOLDING_ACCOUNT_ID,
              date: "2026-02-10T00:00:00.000Z",
              value: toMoney(4),
            }),
            createHoldingBooking({
              id: "h-short-transfer-in-insufficient",
              accountId: SECOND_HOLDING_ACCOUNT_ID,
              date: "2026-02-10T00:00:00.000Z",
              value: toMoney(-4),
            }),
          ],
        },
      ],
      periodStart: new Date("2026-02-01T00:00:00.000Z"),
      periodEndExclusive: new Date("2026-03-01T00:00:00.000Z"),
      initialRateDate: new Date("2026-01-31T00:00:00.000Z"),
      periodEnd: new Date("2026-02-28T00:00:00.000Z"),
      resolveRate: vi.fn().mockResolvedValue(toMoney(100)),
      convertBookingToReference: async (booking) =>
        convertedByBookingId.get(booking.id) ?? null,
    });

    expect(toNumericMoney(result)).toEqual({
      realizedGainLoss: 0,
      unrealizedGainLoss: 0,
      convertedCount: 2,
      skippedCount: 0,
    });
  });

  it("treats mixed-period same-unit holding transfers as non-realizing carry-outs", async () => {
    const convertedByBookingId = new Map<string, Money>([
      ["h-carry-out", toMoney(-440)],
    ]);

    const result = await computeHoldingGainLossSplit({
      holdingAccounts: [...holdingAccounts],
      initialBalanceByAccountId: new Map([
        [HOLDING_ACCOUNT_ID, toMoney(10)],
        [SECOND_HOLDING_ACCOUNT_ID, toMoney(4)],
      ]),
      transactions: [
        {
          bookings: [
            createHoldingBooking({
              id: "h-carry-in-before-period",
              accountId: SECOND_HOLDING_ACCOUNT_ID,
              date: "2026-01-31T00:00:00.000Z",
              value: toMoney(4),
            }),
            createHoldingBooking({
              id: "h-carry-out",
              accountId: HOLDING_ACCOUNT_ID,
              date: "2026-02-01T00:00:00.000Z",
              value: toMoney(-4),
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
          return toMoney(100);
        }
        return toMoney(120);
      }),
      convertBookingToReference: async (booking) =>
        convertedByBookingId.get(booking.id) ?? null,
    });

    expect(toNumericMoney(result)).toEqual({
      realizedGainLoss: 0,
      unrealizedGainLoss: 200,
      convertedCount: 1,
      skippedCount: 0,
    });
  });

  it("uses opening unit basis for mixed-period same-unit carry-ins", async () => {
    const convertedByBookingId = new Map<string, Money>([
      ["h-carry-in", toMoney(110)],
    ]);

    const result = await computeHoldingGainLossSplit({
      holdingAccounts: [...holdingAccounts],
      initialBalanceByAccountId: new Map([
        [HOLDING_ACCOUNT_ID, toMoney(0)],
        [SECOND_HOLDING_ACCOUNT_ID, toMoney(1)],
      ]),
      transactions: [
        {
          bookings: [
            createHoldingBooking({
              id: "h-carry-out-before-period",
              accountId: HOLDING_ACCOUNT_ID,
              date: "2026-01-31T00:00:00.000Z",
              value: toMoney(-1),
            }),
            createHoldingBooking({
              id: "h-carry-in",
              accountId: SECOND_HOLDING_ACCOUNT_ID,
              date: "2026-02-10T00:00:00.000Z",
              value: toMoney(1),
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
          return toMoney(100);
        }
        return toMoney(120);
      }),
      convertBookingToReference: async (booking) =>
        convertedByBookingId.get(booking.id) ?? null,
    });

    expect(toNumericMoney(result)).toEqual({
      realizedGainLoss: 0,
      unrealizedGainLoss: 40,
      convertedCount: 1,
      skippedCount: 0,
    });
  });

  it("skips mixed-period same-unit holding transfers when carry conversion is missing", async () => {
    const result = await computeHoldingGainLossSplit({
      holdingAccounts: [...holdingAccounts],
      initialBalanceByAccountId: new Map([
        [HOLDING_ACCOUNT_ID, toMoney(10)],
        [SECOND_HOLDING_ACCOUNT_ID, toMoney(4)],
      ]),
      transactions: [
        {
          bookings: [
            createHoldingBooking({
              id: "h-carry-in-before-period",
              accountId: SECOND_HOLDING_ACCOUNT_ID,
              date: "2026-01-31T00:00:00.000Z",
              value: toMoney(4),
            }),
            createHoldingBooking({
              id: "h-carry-out",
              accountId: HOLDING_ACCOUNT_ID,
              date: "2026-02-01T00:00:00.000Z",
              value: toMoney(-4),
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
          return toMoney(100);
        }
        return toMoney(120);
      }),
      convertBookingToReference: async (booking) =>
        booking.id === "h-carry-out" ? null : toMoney(0),
    });

    expect(toNumericMoney(result)).toEqual({
      realizedGainLoss: 0,
      unrealizedGainLoss: 280,
      convertedCount: 0,
      skippedCount: 1,
    });
  });

  it("allocates residual by quantity when holding market values are zero", async () => {
    const convertedByBookingId = new Map<string, Money>([
      ["h-a", toMoney(0)],
      ["h-b", toMoney(0)],
      ["c-total", toMoney(-300)],
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
              value: toMoney(2),
            }),
            createHoldingBooking({
              id: "h-b",
              date: "2026-02-10T00:00:00.000Z",
              value: toMoney(1),
            }),
            createCashBooking({
              id: "c-total",
              date: "2026-02-10T00:00:00.000Z",
              value: toMoney(-300),
            }),
          ],
        },
      ],
      periodStart: new Date("2026-02-01T00:00:00.000Z"),
      periodEndExclusive: new Date("2026-03-01T00:00:00.000Z"),
      initialRateDate: new Date("2026-01-31T00:00:00.000Z"),
      periodEnd: new Date("2026-02-28T00:00:00.000Z"),
      resolveRate: vi.fn().mockResolvedValue(toMoney(100)),
      convertBookingToReference: async (booking) =>
        convertedByBookingId.get(booking.id) ?? null,
    });

    expect(
      toNumericMoney({
        ...result,
        unrealizedGainLoss: result.unrealizedGainLoss.toDecimalPlaces(2),
      }),
    ).toEqual({
      realizedGainLoss: 0,
      unrealizedGainLoss: 0,
      convertedCount: 3,
      skippedCount: 0,
    });
  });

  it("uses equal residual allocation when both market values and quantities are zero", async () => {
    const convertedByBookingId = new Map<string, Money>([
      ["h-zero-a", toMoney(0)],
      ["h-zero-b", toMoney(0)],
      ["c-total", toMoney(-200)],
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
              value: toMoney(0),
            }),
            createHoldingBooking({
              id: "h-zero-b",
              date: "2026-02-10T00:00:00.000Z",
              value: toMoney(0),
            }),
            createCashBooking({
              id: "c-total",
              date: "2026-02-10T00:00:00.000Z",
              value: toMoney(-200),
            }),
          ],
        },
      ],
      periodStart: new Date("2026-02-01T00:00:00.000Z"),
      periodEndExclusive: new Date("2026-03-01T00:00:00.000Z"),
      initialRateDate: new Date("2026-01-31T00:00:00.000Z"),
      periodEnd: new Date("2026-02-28T00:00:00.000Z"),
      resolveRate: vi.fn().mockResolvedValue(toMoney(100)),
      convertBookingToReference: async (booking) =>
        convertedByBookingId.get(booking.id) ?? null,
    });

    expect(toNumericMoney(result)).toEqual({
      realizedGainLoss: 0,
      unrealizedGainLoss: 0,
      convertedCount: 3,
      skippedCount: 0,
    });
  });

  it("excludes explicit gain/loss equity bookings from execution price allocation", async () => {
    const convertedByBookingId = new Map<string, Money>([
      ["h-sell", toMoney(-110)],
      ["c-sell", toMoney(120)],
      ["e-gainloss", toMoney(-10)],
    ]);

    const resolveRate = vi.fn().mockImplementation(async ({ date }) => {
      if (date.toISOString() === "2026-01-31T00:00:00.000Z") {
        return toMoney(100);
      }
      return toMoney(120);
    });

    const result = await computeHoldingGainLossSplit({
      holdingAccounts: [...holdingAccounts],
      initialBalanceByAccountId: new Map([[HOLDING_ACCOUNT_ID, toMoney(1)]]),
      transactions: [
        {
          bookings: [
            createHoldingBooking({
              id: "h-sell",
              date: "2026-02-10T00:00:00.000Z",
              value: toMoney(-1),
            }),
            createCashBooking({
              id: "c-sell",
              date: "2026-02-10T00:00:00.000Z",
              value: toMoney(120),
            }),
            createExplicitGainLossBooking({
              id: "e-gainloss",
              date: "2026-02-10T00:00:00.000Z",
              value: toMoney(-10),
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

    expect(toNumericMoney(result.realizedGainLoss)).toBe(20);
    expect(toNumericMoney(result.unrealizedGainLoss)).toBe(0);
    expect(result.convertedCount).toBe(2);
    expect(result.skippedCount).toBe(0);
  });

  it("skips holding contribution when opening balance exists but initial rate is unavailable", async () => {
    const result = await computeHoldingGainLossSplit({
      holdingAccounts: [...holdingAccounts],
      initialBalanceByAccountId: new Map([[HOLDING_ACCOUNT_ID, toMoney(10)]]),
      transactions: [],
      periodStart: new Date("2026-02-01T00:00:00.000Z"),
      periodEndExclusive: new Date("2026-03-01T00:00:00.000Z"),
      initialRateDate: new Date("2026-01-31T00:00:00.000Z"),
      periodEnd: new Date("2026-02-28T00:00:00.000Z"),
      resolveRate: vi.fn().mockResolvedValue(null),
      convertBookingToReference: vi.fn(),
    });

    expect(toNumericMoney(result)).toEqual({
      realizedGainLoss: 0,
      unrealizedGainLoss: 0,
      convertedCount: 0,
      skippedCount: 1,
    });
  });
});
