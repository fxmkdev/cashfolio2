import { describe, expect, it } from "vitest";
import { moneySum } from "../../../shared/money";
import { toNumericMoney } from "../../money-boundary";
import { account, booking, calculate, trade } from "./calculation.test-support";

describe("accumulated account G/L", () => {
  it("orders executions by booking date even when multi-day transactions interleave", async () => {
    const holding = account("a");
    const early = trade("jan", holding, "2026-01-01Z", 1, 100);
    const later = trade("mar", holding, "2026-03-01Z", 1, 100);
    const interleaved = { bookings: [...early.bookings, ...later.bookings] };
    const result = await calculate({
      transactions: [
        interleaved,
        trade("feb", holding, "2026-02-01Z", 1, 200),
        trade("sell", holding, "2026-04-01Z", -2, -300),
      ],
      detailAccountId: "a",
    });
    expect(toNumericMoney(result.results.get("a")!.summary)).toEqual({
      realizedGainLoss: 0,
      unrealizedGainLoss: 60,
      totalGainLoss: 60,
    });
    expect(
      result.realizedEvents
        .find((event) => event.bookingId === "sell")!
        .lotMatches.map((lot) => lot.acquisitionBookingId),
    ).toEqual(["jan", "feb"]);
  });

  it("removes the transferred portion before a multi-day fee disposal and intervening sale", async () => {
    const a = account("a"),
      b = account("b");
    const fee = {
      ...booking(
        "fee",
        { ...account("expense", "CURRENCY"), currency: "CHF" },
        "2026-02-01Z",
        150,
      ),
      accountType: "EQUITY" as const,
      equityAccountSubtype: "EXPENSE" as const,
    };
    const result = await calculate({
      accounts: [a, b],
      detailAccountId: "a",
      transactions: [
        trade("buy1", a, "2026-01-01Z", 9, 900),
        trade("buy2", a, "2026-01-02Z", 2, 240),
        {
          bookings: [
            booking("out", a, "2026-02-01Z", -10),
            booking("in", b, "2026-02-10Z", 9),
            fee,
          ],
        },
        trade("sell", a, "2026-02-05Z", -1, -160),
      ],
    });
    expect(
      toNumericMoney(result.results.get("a")!.summary.realizedGainLoss),
    ).toBe(70);
    expect(
      toNumericMoney(result.results.get("b")!.summary.unrealizedGainLoss),
    ).toBe(540);
    expect(
      result.realizedEvents.find((event) => event.bookingId === "sell")!
        .lotMatches[0]!.acquisitionBookingId,
    ).toBe("buy2");
  });

  it.each(["CURRENCY", "CRYPTOCURRENCY", "SECURITY"] as const)(
    "removes transferred %s lots before an intervening source sale",
    async (unit) => {
      const a = account("a", unit),
        b = account("b", unit);
      const args = {
        accounts: [a, b],
        transactions: [
          {
            bookings: [
              booking("in", b, "2026-01-20Z", 1),
              booking("out", a, "2026-01-03Z", -1),
            ],
          },
          trade("sell", a, "2026-01-10Z", -1, -150),
          trade("buy2", a, "2026-01-02Z", 1, 200),
          trade("buy1", a, "2026-01-01Z", 1, 100),
        ],
      };
      const summary = await calculate(args);
      const source = await calculate({ ...args, detailAccountId: "a" });
      const destination = await calculate({ ...args, detailAccountId: "b" });
      expect(toNumericMoney(source.results.get("a")!.summary)).toEqual({
        realizedGainLoss: -50,
        unrealizedGainLoss: 0,
        totalGainLoss: -50,
      });
      const sale = source.realizedEvents.find(
        (event) => event.bookingId === "sell",
      )!;
      expect(sale.lotMatches.map((lot) => lot.acquisitionBookingId)).toEqual([
        "buy2",
      ]);
      expect(toNumericMoney(destination.unrealizedOpenLots[0]!)).toMatchObject({
        acquisitionBookingId: "buy1",
        quantity: 1,
        unitCostInReference: 100,
        unrealizedGainLoss: 60,
      });
      for (const id of ["a", "b"])
        expect(summary.results.get(id)!.summary).toEqual(
          destination.results.get(id)!.summary,
        );
      expect(
        toNumericMoney(
          moneySum(sale.lotMatches.map((lot) => lot.realizedGainLossDelta)),
        ),
      ).toBe(-50);
    },
  );

  it("carries short lots on the source date before an intervening cover", async () => {
    const a = account("a"),
      b = account("b");
    const result = await calculate({
      accounts: [a, b],
      detailAccountId: "b",
      closingRate: 80,
      transactions: [
        trade("short1", a, "2026-01-01Z", -1, -100),
        trade("short2", a, "2026-01-02Z", -1, -200),
        {
          bookings: [
            booking("out", a, "2026-01-03Z", 1, "BALANCE"),
            booking("in", b, "2026-01-20Z", -1, "BALANCE"),
          ],
        },
        trade("cover", a, "2026-01-10Z", 1, 150),
      ],
    });
    expect(toNumericMoney(result.results.get("a")!.summary)).toMatchObject({
      realizedGainLoss: 50,
    });
    expect(toNumericMoney(result.unrealizedOpenLots[0]!)).toMatchObject({
      quantity: -1,
      unitCostInReference: 100,
      unrealizedGainLoss: 20,
    });
  });

  it("keeps overlapping transfers' lots separate and orders receipts before destination sales", async () => {
    const a = account("a"),
      b = account("b"),
      c = account("c");
    const result = await calculate({
      accounts: [a, b, c],
      detailAccountId: "b",
      transactions: [
        trade("buy1", a, "2026-01-01Z", 1, 100),
        trade("buy2", a, "2026-01-02Z", 1, 200),
        {
          bookings: [
            booking("out1", a, "2026-01-03Z", -1),
            booking("in1", b, "2026-01-20Z", 1),
          ],
        },
        {
          bookings: [
            booking("out2", a, "2026-01-04Z", -1),
            booking("in2", c, "2026-01-15Z", 1),
          ],
        },
        trade("sell", b, "2026-01-21Z", -1, -150),
      ],
    });
    expect(toNumericMoney(result.results.get("b")!.summary)).toMatchObject({
      realizedGainLoss: 50,
    });
    expect(toNumericMoney(result.results.get("c")!.summary)).toMatchObject({
      unrealizedGainLoss: -40,
    });
    expect(
      result.realizedEvents.find((event) => event.bookingId === "sell")!
        .lotMatches[0]!.acquisitionBookingId,
    ).toBe("buy1");
  });

  it("drains each source booking after its own acquisitions in a split transfer", async () => {
    const a = account("a"),
      b = account("b");
    const result = await calculate({
      accounts: [a, b],
      detailAccountId: "b",
      transactions: [
        trade("buy1", a, "2026-01-01Z", 1, 100),
        trade("buy2", a, "2026-01-04Z", 1, 200),
        {
          bookings: [
            booking("out1", a, "2026-01-03Z", -1),
            booking("out2", a, "2026-01-05Z", -1),
            booking("in", b, "2026-01-20Z", 2),
          ],
        },
      ],
    });
    expect(toNumericMoney(result.results.get("a")!.summary)).toMatchObject({
      realizedGainLoss: 0,
    });
    expect(
      result.unrealizedOpenLots.map((lot) =>
        toNumericMoney(lot.unitCostInReference),
      ),
    ).toEqual([100, 200]);
  });

  it("retains existing basis handling for a receipt dated before its withdrawal", async () => {
    const a = account("a"),
      b = account("b");
    const result = await calculate({
      accounts: [a, b],
      detailAccountId: "b",
      transactions: [
        trade("buy", a, "2026-01-01Z", 1, 100),
        {
          bookings: [
            booking("in", b, "2026-01-03Z", 1),
            booking("out", a, "2026-01-20Z", -1),
          ],
        },
      ],
    });
    expect(toNumericMoney(result.unrealizedOpenLots[0]!)).toMatchObject({
      unitCostInReference: 100,
    });
    expect(toNumericMoney(result.results.get("a")!.summary)).toMatchObject({
      totalGainLoss: 0,
    });
  });
});
