import { describe, expect, it, vi } from "vitest";
import { toMoney } from "../../../shared/money";
import { account, booking, cash, returns } from "./return-test-support";

describe("account return calculations", () => {
  it("values partial withdrawals at execution proceeds and retains the remaining position", async () => {
    const { result } = await returns({
      initial: { a: "100" },
      transactions: [
        [
          booking("partial", "2026-06-01", "-50"),
          cash("proceeds", "2026-06-01", "55"),
        ],
      ],
      rate: async ({ currency, date }) => {
        const day = date.toISOString().slice(0, 10);
        return toMoney(
          currency === "CHF" || day < "2026-06-01"
            ? 1
            : day < "2026-12-31"
              ? 1.1
              : 1.2,
        );
      },
    });
    expect(result.twr).toBeCloseTo(0.2, 12);
    expect(result.mwr).not.toBeNull();
    expect(
      -100 + 55 / (1 + result.mwr!) ** (152 / 365) + 60 / (1 + result.mwr!),
    ).toBeCloseTo(0, 10);
    expect(result.cashFlows.map((flow) => flow.amount)).toEqual([-55]);
  });
  it("supports cryptocurrency units using dated reference-currency execution consideration", async () => {
    const { result } = await returns({
      accounts: [
        account("a", {
          unit: "CRYPTOCURRENCY",
          currency: null,
          cryptocurrency: "BTC",
        }),
      ],
      asOfDate: "2026-06-30",
      transactions: [
        [
          booking("buy", "2026-01-01", "1", {
            unit: "CRYPTOCURRENCY",
            currency: null,
            cryptocurrency: "BTC",
          }),
          cash("paid", "2026-01-01", "-9000"),
        ],
      ],
      rate: async ({ unit, date }) =>
        toMoney(
          unit === "CURRENCY"
            ? 1
            : date.toISOString().slice(0, 10) < "2026-06-30"
              ? 9000
              : 11000,
        ),
    });
    expect(result.twr).toBeCloseTo(11000 / 9000 - 1, 12);
    expect(result.mwr).toBeCloseTo(11000 / 9000 - 1, 12);
  });
  it("uses the opening-day valuation and calculates cumulative and annualized returns", async () => {
    const rate = vi.fn(async ({ date }: { date: Date }) =>
      toMoney(date.toISOString().slice(0, 10) === "2025-12-31" ? 1 : 1.21),
    );
    const { result } = await returns({ initial: { a: "100" }, rate });
    expect(result.twr).toBeCloseTo(0.21, 12);
    expect(result.mwr).toBeCloseTo(0.21, 12);
    expect(result.annualizedTwr).toBeCloseTo(0.21, 12);
    expect(result.annualizedMwr).toBeCloseTo(0.21, 12);
    expect(rate.mock.calls[0]![0].date.toISOString()).toContain("2025-12-31");
    expect(result.valuations.length).toBe(2);
  });
  it("uses execution cost and measures a newly funded account over its investment span", async () => {
    const { result } = await returns({
      transactions: [
        [
          booking("buy", "2026-12-31", "100"),
          cash("paid", "2026-12-31", "-100"),
        ],
      ],
    });
    expect(result.twr).toBeCloseTo(0.1, 12);
    expect(result.mwr).toBeCloseTo(0.1, 12);
    expect(result.effectiveStartDate).toBe("2026-12-31");
    expect(result.annualizedMwr).toBeNull();
  });
  it("distinguishes money-weighting after timed funding", async () => {
    const rate = async ({
      date,
      currency,
    }: {
      date: Date;
      currency: string | null;
    }) =>
      toMoney(
        currency === "CHF" || date.toISOString().slice(0, 10) < "2026-07-01"
          ? 1
          : 2,
      );
    const { result } = await returns({
      initial: { a: "100" },
      transactions: [
        [
          booking("deposit", "2026-07-01", "100"),
          cash("paid", "2026-07-01", "-200"),
        ],
      ],
      rate,
    });
    // Start-of-day funding participates in the funding day's return.
    expect(result.twr).toBeCloseTo(1 / 3, 12);
    expect(result.mwr).not.toBeCloseTo(result.twr!, 4);
    expect(result.cashFlows[0]?.amount).toBe(200);
  });
  it("retains closed-account returns and removes time after final withdrawal", async () => {
    const { result } = await returns({
      initial: { a: "100" },
      transactions: [
        [
          booking("sale", "2026-03-01", "-100"),
          cash("proceeds", "2026-03-01", "110"),
        ],
      ],
      rate: async ({ currency, date }) =>
        toMoney(
          currency === "CHF" || date.toISOString().slice(0, 10) < "2026-03-01"
            ? 1
            : 1.1,
        ),
    });
    expect(result.twr).toBeCloseTo(0.1, 12);
    expect(result.mwr).toBeCloseTo(0.1, 12);
    expect(result.effectiveEndDate).toBe("2026-03-01");
    expect(result.annualizedMwr).toBeNull();
  });
  it("preserves unfunded gaps between investment episodes", async () => {
    const { result } = await returns({
      initial: { a: "100" },
      transactions: [
        [
          booking("sale", "2026-03-01", "-100"),
          cash("proceeds", "2026-03-01", "110"),
        ],
        [
          booking("buy", "2026-10-01", "100"),
          cash("paid", "2026-10-01", "-100"),
        ],
      ],
      rate: async ({ currency, date }) =>
        toMoney(
          currency === "CHF" || date.toISOString().slice(0, 10) < "2026-03-01"
            ? 1
            : 1.1,
        ),
    });
    expect(result.twr).toBeCloseTo(0.21, 12);
    expect(result.effectiveStartDate).toBe("2026-01-01");
    expect(result.effectiveEndDate).toBe("2026-12-31");
    expect(result.mwr).not.toBeNull();
  });
  it("uses actual days for leap-year annualization", async () => {
    const { result } = await returns({
      startDate: "2024-01-01",
      asOfDate: "2024-12-31",
      initial: { a: "100" },
      rate: async ({ date }) =>
        toMoney(date.toISOString().startsWith("2023") ? 1 : 1.1),
    });
    expect(result.mwr).toBeCloseTo(0.1, 12);
    expect(result.annualizedMwr).toBeCloseTo(1.1 ** (365 / 366) - 1, 12);
  });
  it("keeps MWR available when only an intermediate valuation is missing", async () => {
    const { result } = await returns({
      initial: { a: "100" },
      transactions: [
        [
          booking("deposit", "2026-07-01", "100"),
          cash("paid", "2026-07-01", "-100"),
        ],
      ],
      rate: async ({ date }) =>
        date.toISOString().startsWith("2026-06-30") ? null : toMoney(1),
    });
    expect(result.twr).toBeNull();
    expect(result.mwr).toBeCloseTo(0, 12);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ metric: "twr" })]),
    );
  });
  it("reports negative capital, missing terminal prices, and empty accounts", async () => {
    expect((await returns({ initial: { a: "-100" } })).result).toMatchObject({
      twr: null,
      mwr: null,
      diagnostics: [
        expect.objectContaining({
          message: expect.stringContaining("negative"),
        }),
      ],
    });
    expect(
      (await returns({ initial: { a: "100" }, rate: async () => null })).result
        .twr,
    ).toBeNull();
    expect((await returns({})).result).toMatchObject({
      twr: null,
      mwr: null,
      effectiveStartDate: null,
    });
  });
  it("handles a complete loss", async () => {
    const { result } = await returns({
      initial: { a: "100" },
      rate: async ({ date }) =>
        toMoney(date.toISOString().startsWith("2025") ? 1 : 0),
    });
    expect(result.twr).toBe(-1);
    expect(result.mwr).toBe(-1);
  });
  it("includes idle reference-currency cash in group capital", async () => {
    const accounts = [account(), account("cash", { currency: "CHF" })];
    const rate = async ({
      currency,
      date,
    }: {
      currency: string | null;
      date: Date;
    }) =>
      toMoney(
        currency === "CHF" || date.toISOString().startsWith("2025") ? 1 : 1.2,
      );
    const leaf = await returns({
      accounts,
      ids: ["a"],
      initial: { a: "100", cash: "100" },
      rate,
    });
    const group = await returns({
      accounts,
      initial: { a: "100", cash: "100" },
      rate,
    });
    expect(leaf.result.twr).toBeCloseTo(0.2, 12);
    expect(group.result.twr).toBeCloseTo(0.1, 12);
    expect(group.result.mwr).toBeCloseTo(0.1, 12);
  });
});
