import { describe, expect, it } from "vitest";
import { moneySum } from "../../../shared/money";
import { toNumericMoney } from "../../money-boundary";
import { account, booking, calculate, trade } from "./calculation.test-support";

describe("accumulated account G/L", () => {
  it.each(["CURRENCY", "CRYPTOCURRENCY", "SECURITY"] as const)(
    "replays %s FIFO across months and reconciles details",
    async (unit) => {
      const holding = account("a", unit);
      const args = {
        accounts: [holding],
        transactions: [
          trade("sell", holding, "2026-03-01Z", -3, -450),
          trade("buy2", holding, "2026-02-01Z", 2, 240),
          trade("buy1", holding, "2026-01-01Z", 2, 200),
        ],
      };
      const summary = await calculate(args);
      const details = await calculate({ ...args, detailAccountId: "a" });
      expect(toNumericMoney(details.results.get("a")!.summary)).toEqual({
        realizedGainLoss: 130,
        unrealizedGainLoss: 40,
        totalGainLoss: 170,
      });
      expect(summary.results.get("a")!.summary).toEqual(
        details.results.get("a")!.summary,
      );
      expect(
        toNumericMoney(
          moneySum(
            details.realizedEvents.map((event) => event.realizedGainLossDelta),
          ),
        ),
      ).toBe(130);
      expect(
        toNumericMoney(
          moneySum(
            details.unrealizedOpenLots.map((lot) => lot.unrealizedGainLoss!),
          ),
        ),
      ).toBe(40);
      expect(
        details.realizedEvents.find((event) => event.bookingId === "sell")!
          .lotMatches,
      ).toHaveLength(2);
      expect(summary.realizedEvents).toEqual([]);
    },
  );

  it.each([
    { sign: 1, acquisition: 100, opposite: 150, closing: 160 },
    { sign: -1, acquisition: 200, opposite: 150, closing: 140 },
  ])(
    "closes opposite destination positions using transferred costs ($sign)",
    async ({ sign, acquisition, opposite, closing }) => {
      const source = account("source");
      const destination = account("destination");
      const transactions = [
        trade(
          "acquire",
          source,
          "2026-01-01Z",
          sign * 2,
          sign * acquisition * 2,
        ),
        trade("opposite", destination, "2026-01-02Z", -sign, -sign * opposite),
        {
          bookings: [
            booking("out", source, "2026-01-03Z", -sign * 2),
            booking("in", destination, "2026-01-04Z", sign * 2),
          ],
        },
        trade("close", destination, "2026-01-05Z", -sign, -sign * closing),
      ];
      const args = {
        accounts: [source, destination],
        transactions,
        closingRate: null,
      };
      const summary = await calculate(args);
      const details = await calculate({
        ...args,
        transactions: [...transactions].reverse().map((transaction) => ({
          bookings: [...transaction.bookings].reverse(),
        })),
        detailAccountId: destination.id,
      });
      expect(
        toNumericMoney(details.results.get(destination.id)!.summary),
      ).toEqual({
        realizedGainLoss: 110,
        unrealizedGainLoss: 0,
        totalGainLoss: 110,
      });
      expect(summary.results).toEqual(details.results);
      expect(toNumericMoney(details.results.get(source.id)!.summary)).toEqual({
        realizedGainLoss: 0,
        unrealizedGainLoss: 0,
        totalGainLoss: 0,
      });
      expect(details.unrealizedOpenLots).toEqual([]);
      expect(details.results.get(destination.id)!.diagnostics).toEqual([]);
      expect(
        toNumericMoney(
          details.realizedEvents.map((event) => ({
            bookingId: event.bookingId,
            delta: event.realizedGainLossDelta,
            running: event.runningRealizedGainLoss,
          })),
        ),
      ).toEqual([
        { bookingId: "opposite", delta: 0, running: 0 },
        { bookingId: "in", delta: 50, running: 50 },
        { bookingId: "close", delta: 60, running: 110 },
      ]);
      const receipt = details.realizedEvents[1]!;
      expect(receipt.id).toBe("event:in:transfer");
      expect(toNumericMoney(receipt.pricing)).toEqual({
        source: "transferBasis",
        marketReferenceAmount: null,
        residualAllocationAmount: 0,
        effectiveReferenceAmount: sign * acquisition,
      });
      expect(
        toNumericMoney(receipt.lotMatches[0]!.executionUnitPriceInReference),
      ).toBe(acquisition);
      expect(receipt.transactionId).toBe("tx:in");
      expect(
        toNumericMoney(
          moneySum(
            details.realizedEvents.map((event) => event.realizedGainLossDelta),
          ),
        ),
      ).toBe(110);
    },
  );

  it.each(["2026-01-03Z", "2026-01-20Z"])(
    "matches multiple carried costs separately and preserves residual basis (receipt %s)",
    async (receiptDate) => {
      const source = account("source");
      const destination = account("destination");
      const result = await calculate({
        accounts: [source, destination],
        detailAccountId: destination.id,
        closingRate: 240,
        transactions: [
          trade("buy1", source, "2026-01-01Z", 1, 100),
          trade("buy2", source, "2026-01-02Z", 1, 200),
          trade("short", destination, "2026-01-02Z", -1.5, -225),
          {
            bookings: [
              booking("out", source, "2026-01-03Z", -2),
              booking("in", destination, receiptDate, 2),
            ],
          },
        ],
      });
      expect(
        toNumericMoney(result.results.get(destination.id)!.summary),
      ).toEqual({
        realizedGainLoss: 25,
        unrealizedGainLoss: 20,
        totalGainLoss: 45,
      });
      const receipt = result.realizedEvents.find(
        (event) => event.bookingId === "in",
      )!;
      expect(toNumericMoney(receipt.quantity)).toBe(1.5);
      expect(toNumericMoney(receipt.effectiveReferenceAmount)).toBe(200);
      expect(
        toNumericMoney(
          receipt.lotMatches.map((match) => ({
            quantity: match.matchedQuantity,
            price: match.executionUnitPriceInReference,
            delta: match.realizedGainLossDelta,
            running: match.runningEventRealizedGainLoss,
          })),
        ),
      ).toEqual([
        { quantity: 1, price: 100, delta: 50, running: 50 },
        { quantity: 0.5, price: 200, delta: -25, running: 25 },
      ]);
      expect(new Set(receipt.lotMatches.map((match) => match.id)).size).toBe(2);
      expect(toNumericMoney(result.unrealizedOpenLots[0])).toMatchObject({
        quantity: 0.5,
        unitCostInReference: 200,
        acquisitionBookingId: "buy2",
      });
    },
  );

  it("keeps realised gains after complete disposal and requires no closing rate", async () => {
    const result = await calculate({
      opening: 2,
      closingRate: null,
      transactions: [trade("sell", account("a"), "2026-03-01Z", -2, -300)],
    });
    expect(toNumericMoney(result.results.get("a")!.summary)).toEqual({
      realizedGainLoss: 100,
      unrealizedGainLoss: 0,
      totalGainLoss: 100,
    });
  });

  it("uses economic gain signs for shorts and transfers their basis", async () => {
    const a = account("a"),
      b = account("b");
    const result = await calculate({
      accounts: [a, b],
      opening: -2,
      closingRate: 80,
      transactions: [
        {
          bookings: [
            booking("out", a, "2026-02-01Z", 2, "BALANCE"),
            booking("in", b, "2026-02-01Z", -2, "BALANCE"),
          ],
        },
        trade("cover", b, "2026-03-01Z", 1, 80),
      ],
    });
    expect(toNumericMoney(result.results.get("b")!.summary)).toEqual({
      realizedGainLoss: 20,
      unrealizedGainLoss: 20,
      totalGainLoss: 40,
    });
  });

  it("shows zero for eligible accounts without holdings", async () => {
    const result = await calculate({ closingRate: null });
    expect(toNumericMoney(result.results.get("a")!.summary)).toEqual({
      realizedGainLoss: 0,
      unrealizedGainLoss: 0,
      totalGainLoss: 0,
    });
  });
});
