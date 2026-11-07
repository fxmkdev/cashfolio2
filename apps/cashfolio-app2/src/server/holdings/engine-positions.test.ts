import { describe, expect, it, vi } from "vitest";
import type { Money } from "../../shared/money";
import { toMoney } from "../../shared/money";
import { toNumericMoney } from "../money-boundary";
import { computeHoldingGainLossSplit } from "./engine.server";
import {
  createCashBooking,
  createHoldingBooking,
  HOLDING_ACCOUNT_ID,
  holdingAccounts,
} from "./engine.test-support";

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
