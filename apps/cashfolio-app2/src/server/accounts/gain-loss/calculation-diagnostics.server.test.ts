import { describe, expect, it } from "vitest";
import { toNumericMoney } from "../../money-boundary";
import { account, booking, calculate, trade } from "./calculation.test-support";

describe("accumulated account G/L", () => {
  it("propagates missing acquisition basis through a transfer with fee bookings", async () => {
    const a = account("a"),
      b = account("b");
    const result = await calculate({
      accounts: [a, b],
      missingBooking: "buy",
      transactions: [
        trade("buy", a, "2026-01-01Z", 10, 1000),
        {
          bookings: [
            booking("out", a, "2026-02-01Z", -10),
            booking("in", b, "2026-02-01Z", 9),
            {
              ...booking("fee", a, "2026-02-01Z", 1),
              accountId: "expense",
              accountType: "EQUITY" as const,
              equityAccountSubtype: "EXPENSE" as const,
            },
          ],
        },
      ],
    });
    expect(result.results.get("b")!.summary.realizedGainLoss).toBeNull();
    expect(
      result.results
        .get("b")!
        .diagnostics.some((item) => item.message.includes("transferred")),
    ).toBe(true);
  });

  it("does not withhold a fully transferred holding because an unrelated execution basis is missing", async () => {
    const a = account("a"),
      b = account("b"),
      c = { ...account("c"), symbol: "MSFT" };
    const result = await calculate({
      accounts: [a, b, c],
      opening: 1,
      missingBooking: "buy-c",
      transactions: [
        {
          bookings: [
            booking("out", a, "2026-02-01Z", -1),
            booking("in", b, "2026-02-01Z", 1),
            ...trade("buy-c", c, "2026-02-01Z", 1, 100).bookings,
          ],
        },
      ],
    });
    expect(
      toNumericMoney(result.results.get("b")!.summary.unrealizedGainLoss),
    ).toBe(60);
    expect(
      toNumericMoney(result.results.get("a")!.summary.realizedGainLoss),
    ).toBe(0);
    expect(result.results.get("c")!.summary.realizedGainLoss).toBeNull();
  });

  it.each([undefined, "out"])(
    "retains market fallback and missing-basis diagnostics for an unfunded multi-day transfer (%s)",
    async (missingBooking) => {
      const a = account("a"),
        b = account("b");
      const result = await calculate({
        accounts: [a, b],
        missingBooking,
        transactions: [
          {
            bookings: [
              booking("out", a, "2026-01-03Z", -1),
              booking("in", b, "2026-01-20Z", 1),
            ],
          },
        ],
      });
      if (missingBooking) {
        expect(result.results.get("a")!.summary.totalGainLoss).toBeNull();
        expect(result.results.get("b")!.summary.totalGainLoss).toBeNull();
      } else {
        expect(toNumericMoney(result.results.get("a")!.summary)).toMatchObject({
          realizedGainLoss: 0,
          unrealizedGainLoss: -60,
        });
        expect(toNumericMoney(result.results.get("b")!.summary)).toMatchObject({
          realizedGainLoss: 0,
          unrealizedGainLoss: 60,
        });
      }
    },
  );

  it("keeps reliable realised gains and inspectable open lots when closing valuation is missing", async () => {
    const result = await calculate({
      detailAccountId: "a",
      opening: 2,
      closingRate: null,
      transactions: [trade("sell", account("a"), "2026-03-01Z", -1, -150)],
    });
    expect(toNumericMoney(result.results.get("a")!.summary)).toEqual({
      realizedGainLoss: 50,
      unrealizedGainLoss: null,
      totalGainLoss: null,
    });
    expect(result.results.get("a")!.diagnostics).toHaveLength(1);
    expect(toNumericMoney(result.unrealizedOpenLots[0])).toMatchObject({
      quantity: 1,
      unitCostInReference: 100,
      periodEndRate: null,
      unrealizedGainLoss: null,
    });
  });

  it.each(["opening", "execution"] as const)(
    "propagates missing %s basis through transfers",
    async (failure) => {
      const a = account("a"),
        b = account("b");
      const result = await calculate({
        accounts: [a, b],
        opening: failure === "opening" ? 2 : 0,
        initialRate: failure === "opening" ? null : 100,
        missingBooking: failure === "execution" ? "buy" : undefined,
        transactions: [
          trade("buy", a, "2026-01-01Z", 2, 200),
          {
            bookings: [
              booking("out", a, "2026-02-01Z", -2),
              booking("in", b, "2026-02-01Z", 2),
            ],
          },
        ],
      });
      for (const id of ["a", "b"])
        expect(result.results.get(id)!.summary).toEqual({
          realizedGainLoss: null,
          unrealizedGainLoss: null,
          totalGainLoss: null,
        });
    },
  );

  it("withholds results when a required cash counterpart conversion is missing", async () => {
    const result = await calculate({
      missingBooking: "cash:buy",
      transactions: [trade("buy", account("a"), "2026-01-01Z", 2, 200)],
    });
    expect(result.results.get("a")!.summary.totalGainLoss).toBeNull();
  });

  it("excludes future executions and explicit G/L amounts", async () => {
    const explicit = {
      ...booking(
        "explicit",
        { ...account("equity", "CURRENCY"), currency: "CHF" },
        "2026-03-01Z",
        -100,
      ),
      accountType: "EQUITY" as const,
      equityAccountSubtype: "GAIN_LOSS" as const,
    };
    const sell = trade("sell", account("a"), "2026-03-01Z", -1, -150);
    const result = await calculate({
      opening: 1,
      transactions: [
        { bookings: [...sell.bookings, explicit] },
        trade("future", account("a"), "2026-06-01Z", 3, 300),
      ],
    });
    expect(toNumericMoney(result.results.get("a")!.summary)).toEqual({
      realizedGainLoss: 50,
      unrealizedGainLoss: 0,
      totalGainLoss: 50,
    });
  });

  it("withholds partially posted holdings and dependent transfer results", async () => {
    const a = account("a"),
      b = account("b");
    const result = await calculate({
      accounts: [a, b],
      unavailableHoldings: ["a"],
      opening: 2,
      transactions: [
        {
          bookings: [
            booking("out", a, "2026-02-01Z", -2),
            booking("in", b, "2026-02-01Z", 2, "BALANCE"),
          ],
        },
      ],
    });
    expect(result.results.get("a")!.summary.totalGainLoss).toBeNull();
    expect(result.results.get("a")!.diagnostics[0]!.message).toContain(
      "partially posted",
    );
    expect(result.results.get("b")!.summary.totalGainLoss).toBeNull();
  });
});
