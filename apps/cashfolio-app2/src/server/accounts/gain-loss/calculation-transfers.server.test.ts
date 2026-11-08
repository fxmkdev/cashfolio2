import { describe, expect, it } from "vitest";
import { toNumericMoney } from "../../money-boundary";
import { account, booking, calculate, trade } from "./calculation.test-support";

describe("accumulated account G/L", () => {
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

  it.each(["CURRENCY", "CRYPTOCURRENCY", "SECURITY"] as const)(
    "splits a %s transfer from its fee disposal and retains FIFO basis",
    async (unit) => {
      const a = account("a", unit),
        b = account("b", unit);
      const fee = {
        ...booking(
          "fee",
          { ...account("expense", "CURRENCY"), currency: "CHF" },
          "2026-03-01Z",
          150,
        ),
        accountType: "EQUITY" as const,
        equityAccountSubtype: "EXPENSE" as const,
      };
      const transactions = [
        trade("buy1", a, "2026-01-01Z", 9, 900),
        trade("buy2", a, "2026-02-01Z", 1, 120),
        {
          bookings: [
            booking("a-out", a, "2026-03-01Z", -10),
            booking("z-in", b, "2026-03-01Z", 9),
            fee,
          ],
        },
      ];
      const source = await calculate({
        accounts: [a, b],
        transactions,
        detailAccountId: "a",
      });
      const destination = await calculate({
        accounts: [a, b],
        transactions,
        detailAccountId: "b",
      });
      expect(toNumericMoney(source.results.get("a")!.summary)).toEqual({
        realizedGainLoss: 30,
        unrealizedGainLoss: 0,
        totalGainLoss: 30,
      });
      expect(toNumericMoney(destination.results.get("b")!.summary)).toEqual({
        realizedGainLoss: 0,
        unrealizedGainLoss: 540,
        totalGainLoss: 540,
      });
      const disposal = source.realizedEvents.find(
        (event) => event.bookingId === "a-out",
      )!;
      expect(toNumericMoney(disposal)).toMatchObject({
        quantity: -1,
        effectiveReferenceAmount: -150,
        realizedGainLossDelta: 30,
      });
      expect(disposal.lotMatches[0]!.acquisitionBookingId).toBe("buy2");
      expect(destination.unrealizedOpenLots[0]!.acquisitionBookingId).toBe(
        "buy1",
      );
      const laterSale = await calculate({
        accounts: [a, b],
        transactions: [
          ...transactions,
          trade("sell", b, "2026-04-01Z", -9, -1440),
        ],
      });
      expect(
        toNumericMoney(laterSale.results.get("b")!.summary.realizedGainLoss),
      ).toBe(540);
    },
  );

  it("transfers all units without pricing them when an unrelated cash fee is present", async () => {
    const a = account("a"),
      b = account("b");
    const cash = { ...account("cash", "CURRENCY"), currency: "CHF" };
    const transactions = [
      trade("buy", a, "2026-01-01Z", 10, 1000),
      {
        bookings: [
          booking("out", a, "2026-02-01Z", -10),
          booking("in", b, "2026-02-01Z", 10),
          booking("fee-cash", cash, "2026-02-01Z", -5),
          {
            ...booking("expense", cash, "2026-02-01Z", 5),
            accountId: "expense",
            accountType: "EQUITY" as const,
            equityAccountSubtype: "EXPENSE" as const,
          },
        ],
      },
    ];
    const result = await calculate({
      accounts: [a, b],
      transactions,
      detailAccountId: "a",
      missingBooking: "out",
    });
    expect(toNumericMoney(result.results.get("a")!.summary)).toEqual({
      realizedGainLoss: 0,
      unrealizedGainLoss: 0,
      totalGainLoss: 0,
    });
    expect(
      toNumericMoney(result.results.get("b")!.summary.unrealizedGainLoss),
    ).toBe(600);
    expect(
      result.realizedEvents.filter((event) => event.bookingId === "out"),
    ).toEqual([]);
  });

  it("keeps receipt transfer and residual acquisition events distinct when covering a short", async () => {
    const a = account("a"),
      b = account("b");
    const result = await calculate({
      accounts: [a, b],
      detailAccountId: "b",
      transactions: [
        trade("buy", a, "2026-01-01Z", 2, 200),
        trade("short", b, "2026-01-01Z", -1, -150),
        {
          bookings: [
            booking("out", a, "2026-02-01Z", -2),
            booking("in", b, "2026-02-01Z", 3),
            booking(
              "cash",
              { ...account("cash", "CURRENCY"), currency: "CHF" },
              "2026-02-01Z",
              -120,
            ),
          ],
        },
      ],
    });
    const receipt = result.realizedEvents.filter(
      (event) => event.bookingId === "in",
    );
    expect(receipt.map((event) => event.id)).toEqual([
      "event:in:transfer",
      "event:in",
    ]);
    expect(
      toNumericMoney(
        receipt.map((event) => ({
          quantity: event.quantity,
          gain: event.realizedGainLossDelta,
        })),
      ),
    ).toEqual([
      { quantity: 1, gain: 50 },
      { quantity: 1, gain: 0 },
    ]);
    expect(toNumericMoney(result.results.get("b")!.summary)).toEqual({
      realizedGainLoss: 50,
      unrealizedGainLoss: 100,
      totalGainLoss: 150,
    });
    expect(
      toNumericMoney(result.unrealizedOpenLots.at(-1)!.unitCostInReference),
    ).toBe(120);
  });

  it("routes carried costs across accounts even when an account both sends and receives", async () => {
    const a = account("a"),
      b = account("b"),
      c = account("c");
    const result = await calculate({
      accounts: [a, b, c],
      transactions: [
        trade("buy-a", a, "2026-01-01Z", 1, 100),
        trade("buy-b", b, "2026-01-01Z", 1, 200),
        {
          bookings: [
            booking("a-out", a, "2026-02-01Z", -1),
            booking("b-out", b, "2026-02-01Z", -1),
            booking("a-in", a, "2026-02-01Z", 1),
            booking("c-in", c, "2026-02-01Z", 1),
          ],
        },
      ],
    });
    expect(
      toNumericMoney(result.results.get("a")!.summary.unrealizedGainLoss),
    ).toBe(-40);
    expect(
      toNumericMoney(result.results.get("c")!.summary.unrealizedGainLoss),
    ).toBe(60);
    expect(toNumericMoney(result.results.get("b")!.summary.totalGainLoss)).toBe(
      0,
    );
  });

  it("keeps fallback and residual execution lots and events separately addressable", async () => {
    const a = account("a"),
      b = account("b");
    const result = await calculate({
      accounts: [a, b],
      detailAccountId: "b",
      transactions: [
        {
          bookings: [
            booking("out", a, "2026-02-01Z", -1),
            booking("in", b, "2026-02-01Z", 2),
            booking(
              "cash",
              { ...account("cash", "CURRENCY"), currency: "CHF" },
              "2026-02-01Z",
              -120,
            ),
          ],
        },
      ],
    });
    expect(new Set(result.realizedEvents.map((event) => event.id)).size).toBe(
      2,
    );
    expect(new Set(result.unrealizedOpenLots.map((lot) => lot.id)).size).toBe(
      2,
    );
    expect(
      result.unrealizedOpenLots.map((lot) => lot.acquisitionBookingId),
    ).toEqual(["in", "in"]);
    expect(
      toNumericMoney(
        result.unrealizedOpenLots.map((lot) => lot.unitCostInReference),
      ).sort(),
    ).toEqual([100, 120]);
  });

  it("preserves split fallback lot FIFO order after a later transfer", async () => {
    const a = account("a"),
      b = account("b"),
      c = account("c");
    const result = await calculate({
      accounts: [a, b, c],
      detailAccountId: "c",
      transactions: [
        {
          bookings: [
            booking("out", a, "2026-02-01Z", -1),
            booking("in", b, "2026-02-01Z", 2),
            booking(
              "cash",
              { ...account("cash", "CURRENCY"), currency: "CHF" },
              "2026-02-01Z",
              -120,
            ),
          ],
        },
        {
          bookings: [
            booking("later-out", b, "2026-03-01Z", -2),
            booking("later-in", c, "2026-03-01Z", 2),
          ],
        },
        trade("sale", c, "2026-04-01Z", -1, -160),
      ],
    });
    expect(toNumericMoney(result.results.get("c")!.summary)).toEqual({
      realizedGainLoss: 60,
      unrealizedGainLoss: 40,
      totalGainLoss: 100,
    });
    expect(
      toNumericMoney(
        result.realizedEvents[0]!.lotMatches[0]!.lotUnitCostInReference,
      ),
    ).toBe(100);
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
});
