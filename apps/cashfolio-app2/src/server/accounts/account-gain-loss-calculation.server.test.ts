import { describe, expect, it, vi } from "vitest";
import { toMoney, moneyMultiply, moneySum } from "../../shared/money";
import { toNumericMoney } from "../money-boundary";
import { calculateAccountGainLoss } from "./account-gain-loss-calculation.server";
import type {
  HoldingRateConvertibleAccount,
  HoldingTransaction,
  HoldingTransactionBooking,
} from "../period/holdings/period-overview-holdings-types";

const dates = {
  start: new Date("2026-01-01Z"),
  initial: new Date("2025-12-31Z"),
  end: new Date("2026-04-30Z"),
  exclusive: new Date("2026-05-01Z"),
};
function account(
  id: string,
  unit: "SECURITY" | "CRYPTOCURRENCY" | "CURRENCY" = "SECURITY",
): HoldingRateConvertibleAccount {
  return {
    id,
    unit,
    currency: unit === "CURRENCY" ? "USD" : null,
    cryptocurrency: unit === "CRYPTOCURRENCY" ? "BTC" : null,
    symbol: unit === "SECURITY" ? "AAPL" : null,
    tradeCurrency: unit === "SECURITY" ? "CHF" : null,
  };
}
function booking(
  id: string,
  holding: HoldingRateConvertibleAccount,
  date: string,
  value: number,
  type: "ASSET" | "LIABILITY" = "ASSET",
): HoldingTransactionBooking {
  return {
    ...holding,
    id,
    accountId: holding.id,
    date: new Date(date),
    value: toMoney(value),
    accountType: type,
    equityAccountSubtype: null,
    transactionId: `tx:${id}`,
    transactionDescription: id,
  };
}
function trade(
  id: string,
  holding: HoldingRateConvertibleAccount,
  date: string,
  quantity: number,
  amount: number,
): HoldingTransaction {
  return {
    bookings: [
      booking(id, holding, date, quantity),
      booking(
        `cash:${id}`,
        { ...account("cash", "CURRENCY"), currency: "CHF" },
        date,
        -amount,
      ),
    ],
  };
}
function calculate(
  args: {
    accounts?: HoldingRateConvertibleAccount[];
    transactions?: HoldingTransaction[];
    opening?: number;
    closingRate?: number | null;
    initialRate?: number | null;
    missingBooking?: string;
    detailAccountId?: string;
    unavailableHoldings?: string[];
  } = {},
) {
  const accounts = args.accounts ?? [account("a")];
  return calculateAccountGainLoss({
    holdingAccounts: accounts,
    initialBalanceByAccountId: new Map([
      [accounts[0]!.id, toMoney(args.opening ?? 0)],
    ]),
    transactions: args.transactions ?? [],
    periodStart: dates.start,
    periodEnd: dates.end,
    periodEndExclusive: dates.exclusive,
    initialRateDate: dates.initial,
    detailAccountId: args.detailAccountId,
    unavailableHoldings: args.unavailableHoldings,
    resolveRate: vi.fn(async ({ date }) => {
      const rate =
        date.getTime() === dates.initial.getTime()
          ? args.initialRate === undefined
            ? 100
            : args.initialRate
          : args.closingRate === undefined
            ? 160
            : args.closingRate;
      return rate == null ? null : toMoney(rate);
    }),
    convertBookingToReference: async (item) =>
      item.id === args.missingBooking
        ? null
        : moneyMultiply(item.value, item.currency === "CHF" ? 1 : 100),
  });
}

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
      expect(receipt.id).toBe("event:in");
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

  it("records zero-gain transfer matches across split receipts", async () => {
    const source = account("source");
    const destination = account("destination");
    const result = await calculate({
      accounts: [source, destination],
      detailAccountId: destination.id,
      transactions: [
        trade("buy", source, "2026-01-01Z", 2, 200),
        trade("short", destination, "2026-01-02Z", -1.5, -150),
        {
          bookings: [
            booking("out", source, "2026-01-03Z", -2),
            booking("first", destination, "2026-01-04Z", 1),
            booking("second", destination, "2026-02-01Z", 1),
          ],
        },
      ],
    });
    const receipts = result.realizedEvents.filter(
      (event) => event.pricing.source === "transferBasis",
    );
    expect(toNumericMoney(receipts.map((event) => event.quantity))).toEqual([
      1, 0.5,
    ]);
    expect(
      toNumericMoney(receipts.map((event) => event.realizedGainLossDelta)),
    ).toEqual([0, 0]);
    expect(toNumericMoney(result.unrealizedOpenLots[0])).toMatchObject({
      quantity: 0.5,
      unitCostInReference: 100,
      acquisitionBookingId: "buy",
    });
  });

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
  it("preserves purchase basis through transfer and later sale, irrespective of input order", async () => {
    const a = account("a"),
      b = account("b");
    const transfer = {
      bookings: [
        booking("out", a, "2026-02-01Z", -2),
        booking("in", b, "2026-02-01Z", 2),
      ],
    };
    const result = await calculate({
      accounts: [a, b],
      transactions: [
        trade("sell", b, "2026-03-01Z", -1, -150),
        transfer,
        trade("buy", a, "2026-01-01Z", 2, 200),
      ],
      detailAccountId: "b",
    });
    expect(toNumericMoney(result.results.get("a")!.summary)).toEqual({
      realizedGainLoss: 0,
      unrealizedGainLoss: 0,
      totalGainLoss: 0,
    });
    expect(toNumericMoney(result.results.get("b")!.summary)).toEqual({
      realizedGainLoss: 50,
      unrealizedGainLoss: 60,
      totalGainLoss: 110,
    });
    expect(result.realizedEvents[0]!.lotMatches[0]!.acquisitionBookingId).toBe(
      "buy",
    );
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
            booking("out", a, "2026-01-03Z", 1, "LIABILITY"),
            booking("in", b, "2026-01-20Z", -1, "LIABILITY"),
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
            booking("out", a, "2026-02-01Z", 2, "LIABILITY"),
            booking("in", b, "2026-02-01Z", -2, "LIABILITY"),
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
            booking("in", b, "2026-02-01Z", 2, "LIABILITY"),
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
  it("shows zero for eligible accounts without holdings", async () => {
    const result = await calculate({ closingRate: null });
    expect(toNumericMoney(result.results.get("a")!.summary)).toEqual({
      realizedGainLoss: 0,
      unrealizedGainLoss: 0,
      totalGainLoss: 0,
    });
  });
});
