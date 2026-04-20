import { describe, expect, it, vi } from "vitest";
import { Unit } from "../.prisma-client/enums";
import { computeHoldingAccountGainLoss } from "./period-overview-holdings";

const securityAccount = {
  unit: Unit.SECURITY,
  currency: null,
  cryptocurrency: null,
  symbol: "AAPL",
  tradeCurrency: "USD",
} as const;

describe("period overview holdings", () => {
  it("returns zero contribution when no initial balance and no period bookings", async () => {
    const resolveRate = vi.fn();

    const result = await computeHoldingAccountGainLoss({
      account: securityAccount,
      initialBalance: 0,
      periodBookings: [],
      initialRateDate: new Date("2026-01-31T00:00:00.000Z"),
      periodEnd: new Date("2026-02-28T00:00:00.000Z"),
      resolveRate,
    });

    expect(result).toEqual({ skippedCount: 0, gainLossContribution: 0 });
    expect(resolveRate).not.toHaveBeenCalled();
  });

  it("skips contribution when the initial rate cannot be resolved", async () => {
    const resolveRate = vi.fn().mockResolvedValue(null);

    const result = await computeHoldingAccountGainLoss({
      account: securityAccount,
      initialBalance: 10,
      periodBookings: [
        { date: new Date("2026-02-10T00:00:00.000Z"), value: 2 },
      ],
      initialRateDate: new Date("2026-01-31T00:00:00.000Z"),
      periodEnd: new Date("2026-02-28T00:00:00.000Z"),
      resolveRate,
    });

    expect(result).toEqual({ skippedCount: 1, gainLossContribution: 0 });
    expect(resolveRate).toHaveBeenCalledTimes(1);
  });

  it("computes gain/loss contribution from initial and event rates", async () => {
    const resolveRate = vi
      .fn()
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(4);

    const result = await computeHoldingAccountGainLoss({
      account: securityAccount,
      initialBalance: 10,
      periodBookings: [
        { date: new Date("2026-02-10T00:00:00.000Z"), value: 5 },
      ],
      initialRateDate: new Date("2026-01-31T00:00:00.000Z"),
      periodEnd: new Date("2026-02-28T00:00:00.000Z"),
      resolveRate,
    });

    expect(result).toEqual({ skippedCount: 0, gainLossContribution: 25 });
    expect(resolveRate).toHaveBeenCalledTimes(3);
  });
});
