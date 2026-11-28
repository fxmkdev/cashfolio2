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

    expect(result.mwr).toBeCloseTo(11000 / 9000 - 1, 12);
  });
  it("uses the opening-day valuation and calculates cumulative and annualized returns", async () => {
    const rate = vi.fn(async ({ date }: { date: Date }) =>
      toMoney(date.toISOString().slice(0, 10) === "2025-12-31" ? 1 : 1.21),
    );
    const { result } = await returns({ initial: { a: "100" }, rate });

    expect(result.mwr).toBeCloseTo(0.21, 12);

    expect(result.annualizedMwr).toBeCloseTo(0.21, 12);
    expect(rate.mock.calls[0]![0].date.toISOString()).toContain("2025-12-31");
    expect(result.valuations.map((v) => v.kind)).toEqual([
      "opening",
      "intermediate",
      "closing",
    ]);
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

    expect(
      -100 - 200 / (1 + result.mwr!) ** (181 / 365) + 400 / (1 + result.mwr!),
    ).toBeCloseTo(0, 10);
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

    expect(result.mwr).toBeCloseTo(0, 12);
    expect(result.diagnostics).toEqual([]);
    expect(result.valuations).toContainEqual({
      id: "2026-06-30",
      date: "2026-06-30",
      kind: "intermediate",
      value: null,
    });
  });
  it("reports negative capital, missing terminal prices, and empty accounts", async () => {
    expect((await returns({ initial: { a: "-100" } })).result).toMatchObject({
      mwr: null,
      diagnostics: [
        expect.objectContaining({
          message: expect.stringContaining("negative"),
        }),
      ],
    });
    expect(
      (await returns({ initial: { a: "100" }, rate: async () => null })).result
        .mwr,
    ).toBeNull();
    expect((await returns({})).result).toMatchObject({
      mwr: null,
      effectiveStartDate: null,
    });
  });
  it("retains pre-funding negative-capital checks when endpoints are positive", async () => {
    const { result } = await returns({
      accounts: [account(), account("b", { currency: "CHF" })],
      initial: { a: "100", b: "-50" },
      transactions: [
        [
          cash("fund", "2026-07-01", "50", { accountId: "b" }),
          cash("paid", "2026-07-01", "-50"),
        ],
      ],
      rate: async ({ currency, date }) =>
        toMoney(
          currency === "CHF" || date.toISOString().startsWith("2025")
            ? 1
            : date.toISOString().startsWith("2026-06-30")
              ? 0.4
              : 0.6,
        ),
    });
    expect(result.valuations[0]?.value).toBe(50);
    expect(result.valuations.at(-1)?.value).toBe(60);
    expect(result.valuations).toContainEqual({
      id: "2026-06-30",
      date: "2026-06-30",
      kind: "intermediate",
      value: -10,
    });
    expect(result.mwr).toBeNull();
    expect(result.diagnostics[0]?.message).toContain("negative");
  });
  it("omits detail records without changing results or valuation requests", async () => {
    const rate = vi.fn(async () => toMoney(1));
    const details = (await returns({ initial: { a: "100" }, rate })).result;
    const count = rate.mock.calls.length;
    rate.mockClear();
    const summary = (
      await returns({ initial: { a: "100" }, rate, includeDetails: false })
    ).result;
    expect(summary).toEqual({ ...details, valuations: [], cashFlows: [] });
    expect(rate).toHaveBeenCalledTimes(count);
  });
  it("handles a complete loss", async () => {
    const { result } = await returns({
      initial: { a: "100" },
      rate: async ({ date }) =>
        toMoney(date.toISOString().startsWith("2025") ? 1 : 0),
    });

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
    expect(leaf.result.mwr).toBeCloseTo(0.2, 12);
    expect(group.result.mwr).toBeCloseTo(0.1, 12);
    expect(group.result.mwr).toBeCloseTo(0.1, 12);
  });
});
