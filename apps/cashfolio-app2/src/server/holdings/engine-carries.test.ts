import { describe, expect, it, vi } from "vitest";
import type { Money } from "../../shared/money";
import { toMoney } from "../../shared/money";
import { toNumericMoney } from "../money-boundary";
import { computeHoldingGainLossSplit } from "./engine.server";
import {
  createHoldingBooking,
  HOLDING_ACCOUNT_ID,
  holdingAccounts,
  SECOND_HOLDING_ACCOUNT_ID,
} from "./engine.test-support";

describe("period overview holdings FIFO", () => {
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
});
