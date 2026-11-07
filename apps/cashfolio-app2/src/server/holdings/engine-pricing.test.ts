import { describe, expect, it, vi } from "vitest";
import type { Money } from "../../shared/money";
import { toMoney } from "../../shared/money";
import { toNumericMoney } from "../money-boundary";
import { computeHoldingGainLossSplit } from "./engine";
import {
  createCashBooking,
  createExplicitGainLossBooking,
  createHoldingBooking,
  HOLDING_ACCOUNT_ID,
  holdingAccounts,
} from "./engine.test-support";

describe("period overview holdings FIFO", () => {
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
});
