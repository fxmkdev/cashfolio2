import { describe, expect, it, vi } from "vitest";
import type { Money } from "../../shared/money";
import { toMoney } from "../../shared/money";
import { toNumericMoney } from "../money-boundary";
import { computeHoldingGainLossSplit } from "./engine";
import {
  createCashBooking,
  createHoldingBooking,
  HOLDING_ACCOUNT_ID,
  holdingAccounts,
  SECOND_HOLDING_ACCOUNT_ID,
} from "./engine.test-support";

describe("period overview holdings FIFO", () => {
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
});
