import { describe, expect, it, vi } from "vitest";
import { account, booking, cash, returns } from "./return-test-support";
import { toMoney } from "../../../shared/money";

describe("performance capital movement normalization", () => {
  it("includes a transfer already in transit at book start with no posting inside the range", async () => {
    const { result } = await returns({
      accounts: [account(), account("b")],
      initial: {},
      asOfDate: "2026-01-03",
      transactions: [
        [
          booking("out", "2025-12-29", "-100"),
          booking("in", "2026-01-05", "100", { accountId: "b" }),
        ],
      ],
      rate: async ({ date }) =>
        toMoney(date.toISOString().startsWith("2025") ? 1 : 1.1),
    });
    expect(result.twr).toBeCloseTo(0.1, 12);
    expect(result.mwr).toBeCloseTo(0.1, 12);
    expect(result.cashFlows).toEqual([]);
  });
  it("counts recorded total-value gains exactly once and excludes income and fees", async () => {
    const accounts = [
      account("a", {
        currency: "CHF",
        trackingMethod: "TOTAL_PORTFOLIO_VALUE",
      }),
    ];
    const adjustment = [
      cash("gain-value", "2026-02-01", "100", { accountId: "a" }),
      cash("gain", "2026-02-01", "-100", {
        accountId: "gain",
        accountType: "EQUITY",
        equityAccountSubtype: "GAIN_LOSS",
      }),
    ];
    const { result, prepared } = await returns({
      accounts,
      initial: { a: "1000" },
      transactions: [
        adjustment,
        [
          cash("interest-value", "2026-03-01", "50", { accountId: "a" }),
          cash("interest", "2026-03-01", "-50", {
            accountType: "EQUITY",
            equityAccountSubtype: "INCOME",
          }),
        ],
        [
          cash("fee-value", "2026-04-01", "-10", { accountId: "a" }),
          cash("fee", "2026-04-01", "10", {
            accountType: "EQUITY",
            equityAccountSubtype: "EXPENSE",
          }),
        ],
      ],
    });
    expect(prepared.recordedAccountIds.has("a")).toBe(true);
    expect(result.twr).toBeCloseTo(0.1, 12);
    expect(result.cashFlows.map((flow) => flow.amount)).toEqual([50, -10]);
    expect(result.mwr).not.toBeNull();
  });
  it("recognizes a recorded adjustment on its equity date despite a later counterpart date", async () => {
    const { result } = await returns({
      accounts: [account("a", { currency: "CHF" })],
      initial: { a: "1000" },
      asOfDate: "2026-03-03",
      transactions: [
        [
          cash("gain-value", "2026-03-05", "100", { accountId: "a" }),
          cash("gain", "2026-03-01", "-100", {
            accountId: "gain",
            accountType: "EQUITY",
            equityAccountSubtype: "GAIN_LOSS",
          }),
        ],
      ],
    });
    expect(result.twr).toBeCloseTo(0.1, 12);
    expect(result.mwr).toBeCloseTo(0.1, 12);
    expect(result.cashFlows).toEqual([]);
  });
  it("combines recorded native-unit adjustments with FX performance", async () => {
    const { result } = await returns({
      initial: { a: "1000" },
      transactions: [
        [
          booking("gain-value", "2026-02-01", "100"),
          booking("gain", "2026-02-01", "-100", {
            accountId: "gain",
            accountType: "EQUITY",
            equityAccountSubtype: "GAIN_LOSS",
          }),
        ],
      ],
      rate: async ({ date }) =>
        toMoney(date.toISOString().startsWith("2025") ? 1 : 1.2),
    });
    expect(result.twr).toBeCloseTo(0.32, 12);
    expect(result.mwr).toBeCloseTo(0.32, 12);
  });
  it.each([false, true])(
    "bridges same-unit internal transfers in both posting orders (receipt first: %s)",
    async (receiptFirst) => {
      const accounts = [account(), account("b")];
      const transactions = [
        [
          booking("out", receiptFirst ? "2026-03-05" : "2026-03-01", "-100"),
          booking("in", receiptFirst ? "2026-03-01" : "2026-03-05", "100", {
            accountId: "b",
          }),
        ],
      ];
      const rate = async ({ date }: { date: Date }) => {
        const day = date.toISOString().slice(0, 10);
        return toMoney(
          day < "2026-03-01"
            ? 1
            : day < "2026-03-05"
              ? 1.1
              : day < "2026-12-31"
                ? 1.2
                : 1.3,
        );
      };
      const { result } = await returns({
        accounts,
        initial: { a: "100" },
        transactions,
        rate,
      });
      expect(result.twr).toBeCloseTo(0.3, 12);
      expect(result.mwr).toBeCloseTo(0.3, 12);
      expect(result.cashFlows).toHaveLength(0);
      const destination = await returns({
        accounts,
        ids: ["b"],
        initial: { a: "100" },
        transactions,
        rate,
      });
      expect(destination.result.twr).toBeCloseTo(
        1.3 / (receiptFirst ? 1.1 : 1.2) - 1,
        12,
      );
    },
  );
  it("retains a group's in-transit position through a future receipt without requesting future prices", async () => {
    const rate = vi.fn(async ({ date }: { date: Date }) => {
      expect(date.toISOString().slice(0, 10) <= "2026-03-03").toBe(true);
      return toMoney(date.toISOString().startsWith("2025") ? 1 : 1.1);
    });
    const { result } = await returns({
      accounts: [account(), account("b")],
      initial: { a: "100" },
      asOfDate: "2026-03-03",
      rate,
      transactions: [
        [
          booking("out", "2026-03-01", "-100"),
          booking("in", "2026-03-05", "100", { accountId: "b" }),
        ],
      ],
    });
    expect(result.twr).toBeCloseTo(0.1, 12);
    expect(result.cashFlows).toEqual([]);
  });
  it("cancels internal execution consideration while neutralizing separately booked fees", async () => {
    const accounts = [
      account("stock", {
        unit: "SECURITY",
        currency: null,
        symbol: "TEST",
        tradeCurrency: "CHF",
      }),
      account("cash", { currency: "CHF" }),
    ];
    const transactions = [
      [
        cash("payment", "2026-02-01", "-105"),
        cash("shares", "2026-02-01", "10", {
          accountId: "stock",
          unit: "SECURITY",
          currency: null,
          symbol: "TEST",
          tradeCurrency: "CHF",
        }),
        cash("fee", "2026-02-01", "5", {
          accountId: "fee",
          accountType: "EQUITY",
          equityAccountSubtype: "EXPENSE",
        }),
      ],
    ];
    const { result } = await returns({
      accounts,
      initial: { cash: "200" },
      transactions,
      rate: async ({ unit }) => toMoney(unit === "SECURITY" ? 10 : 1),
    });
    expect(result.twr).toBeCloseTo(0, 12);
    expect(result.mwr).toBeCloseTo(0, 12);
    expect(result.cashFlows.map((flow) => flow.amount)).toEqual([-5]);
  });
  it("bridges multi-day execution settlement in reference currency", async () => {
    const accounts = [
      account("stock", {
        unit: "SECURITY",
        currency: null,
        symbol: "TEST",
        tradeCurrency: "CHF",
      }),
      account("cash", { currency: "CHF" }),
    ];
    const { result } = await returns({
      accounts,
      initial: { cash: "200" },
      transactions: [
        [
          cash("payment", "2026-02-01", "-100"),
          cash("shares", "2026-02-03", "10", {
            accountId: "stock",
            unit: "SECURITY",
            currency: null,
            symbol: "TEST",
            tradeCurrency: "CHF",
          }),
        ],
      ],
      rate: async ({ unit }) => toMoney(unit === "SECURITY" ? 10 : 1),
    });
    expect(result.twr).toBeCloseTo(0, 12);
    expect(result.cashFlows).toEqual([]);
  });
  it("withholds ambiguous recorded adjustments and partially posted executions", async () => {
    const ambiguous = await returns({
      initial: { a: "100" },
      transactions: [
        [
          booking("gain", "2026-03-01", "-5", {
            accountType: "EQUITY",
            equityAccountSubtype: "GAIN_LOSS",
            accountId: "equity",
          }),
          booking("first", "2026-03-01", "2"),
          booking("second", "2026-03-01", "3"),
        ],
      ],
    });
    expect(ambiguous.result.diagnostics[0]?.message).toContain("ambiguous");
    const partial = await returns({
      initial: { a: "100" },
      asOfDate: "2026-03-01",
      transactions: [
        [
          booking("buy", "2026-03-01", "100"),
          cash("paid", "2026-03-03", "-100"),
        ],
      ],
    });
    expect(partial.result).toMatchObject({
      twr: null,
      mwr: null,
      diagnostics: [
        expect.objectContaining({
          message: expect.stringContaining("partially posted"),
        }),
      ],
    });
  });
});
