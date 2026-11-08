import { describe, expect, it, vi } from "vitest";
import { Unit } from "../../.prisma-client/enums";
import type { Money } from "../../shared/money";
import { toMoney } from "../../shared/money";
import { toNumericMoney } from "../money-boundary";
import { computeHoldingGainLossSplit } from "./engine";
import {
  createCashBooking,
  createHoldingBooking,
  createHoldingCurrencyBooking,
  holdingAccounts,
} from "./engine.test-support";

describe("period overview holdings FIFO", () => {
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
});
