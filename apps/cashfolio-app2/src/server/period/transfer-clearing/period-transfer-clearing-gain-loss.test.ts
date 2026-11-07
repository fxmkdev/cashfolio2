import { describe, expect, it } from "vitest";
import { Unit } from "../../../.prisma-client/enums";
import { toMoney } from "../../../shared/money";
import { computeTransferClearingGainLossSplit } from "./period-transfer-clearing-gain-loss";
import type { TransferClearingUnitBucket } from "./period-transfer-clearing-types";

function bucket(
  symbol: string,
  postings: { id: string; value: string; date?: string }[],
): TransferClearingUnitBucket {
  const identity = {
    unit: Unit.SECURITY,
    currency: null,
    cryptocurrency: null,
    symbol,
    tradeCurrency: "CHF",
  };
  return {
    ...identity,
    unitKey: `security:${symbol}:CHF`,
    unitLabel: `${symbol}:CHF`,
    unitType: "security",
    isNonReferenceUnit: true,
    rawBalance: toMoney(0),
    bookings: [
      {
        ...identity,
        id: `opening:${symbol}`,
        date: new Date("2026-01-31Z"),
        value: toMoney(-1),
      },
      ...postings.map((posting) => ({
        ...identity,
        ...posting,
        date: new Date(posting.date ?? "2026-02-01Z"),
        value: toMoney(posting.value),
      })),
    ],
  };
}

describe("transfer-clearing accumulation stages", () => {
  it("keeps global Decimal accumulation in execution order across unit buckets", async () => {
    const convertedById = new Map([
      ["a-sale", "1e41"],
      ["b-sale-loss", "0"],
      ["b-buy", "0"],
      ["b-sale-gain", "1"],
    ]);
    const trace: string[] = [];
    const unitAmounts: string[] = [];
    const result = await computeTransferClearingGainLossSplit({
      unitBuckets: [
        bucket("A", [{ id: "a-sale", value: "1" }]),
        bucket("B", [
          { id: "b-sale-loss", value: "1" },
          { id: "b-buy", value: "-1", date: "2026-02-02Z" },
          { id: "b-sale-gain", value: "1", date: "2026-02-03Z" },
        ]),
      ],
      periodStart: new Date("2026-02-01Z"),
      periodEndExclusive: new Date("2026-03-01Z"),
      initialRateDate: new Date("2026-01-31Z"),
      periodEnd: new Date("2026-02-28Z"),
      resolveRate: async ({ symbol }) => toMoney(symbol === "A" ? "0" : "1e41"),
      convertBookingToReference: async ({ id }) =>
        toMoney(convertedById.get(id)!),
      onUnitExecutionEvent: ({ bookingId }) => trace.push(`event:${bookingId}`),
      onUnitGainLoss: ({ unitKey, realizedGainLoss }) => {
        trace.push(`unit:${unitKey}`);
        unitAmounts.push(realizedGainLoss.toString());
      },
    });

    // Summing the two unit totals would lose the final unit at Decimal precision 40.
    expect(unitAmounts).toEqual(["1e+41", "-1e+41"]);
    expect(result.realizedGainLoss.toString()).toBe("1");
    expect(result.unrealizedGainLoss.toString()).toBe("0");
    expect(result.convertedCount).toBe(4);
    expect(result.skippedCount).toBe(0);
    expect(trace).toEqual([
      "event:a-sale",
      "unit:security:A:CHF",
      "event:b-sale-loss",
      "event:b-buy",
      "event:b-sale-gain",
      "unit:security:B:CHF",
    ]);
  });
});
