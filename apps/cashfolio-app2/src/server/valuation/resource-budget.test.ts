import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const cache = vi.hoisted(() => ({
  getCachedRate: vi.fn(),
  storeCachedRate: vi.fn(),
  getBacktrackedFallbackFromCache: vi.fn(),
  storeBacktrackedFallbackInCache: vi.fn(),
  clearBacktrackedFallbackFromCache: vi.fn(),
  hasRecentMissedAttemptForSeriesTimestamp: vi.fn(),
  storeMissedAttemptForSeriesTimestamp: vi.fn(),
  clearMissedAttemptForSeriesTimestamp: vi.fn(),
}));
vi.mock("./cache", () => cache);
vi.mock("./provider-usage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./provider-usage")>()),
  recordValuationProviderRequest: vi.fn().mockResolvedValue(undefined),
}));
import {
  startReadBudget,
  consumeProviderAttempt,
  checkResourceBudget,
  withResourceRequest,
} from "../resource-context.server";
import { fetchProviderResponse } from "./providers/request";
import { getRateWithBacktracking } from "./backtracking";
import { deferred } from "../test-support/deferred";
import { fetchSecurityPriceFromMarketstack } from "./providers/marketstack";
import { getHistoryWindow } from "../period/history/history-window";
import { loadCompleteHistory } from "@/routes/$accountBookId/history/-history-loading";

const wire = vi.fn<typeof fetch>();
const recordUsage = vi.fn().mockResolvedValue(undefined);
const request = () =>
  fetchProviderResponse({
    url: "https://provider.example.test/",
    timeoutMs: 10_000,
    timeoutMessage: "Timeout",
    requestContext: {},
    recordUsage,
  });
async function run(operation: () => Promise<void>) {
  return withResourceRequest(new AbortController().signal, async () => {
    startReadBudget();
    await operation();
    return new Response("complete");
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  cache.getCachedRate.mockResolvedValue(null);
  cache.getBacktrackedFallbackFromCache.mockResolvedValue(null);
  cache.hasRecentMissedAttemptForSeriesTimestamp.mockResolvedValue(false);
  wire.mockImplementation(async () => new Response("1"));
  vi.stubGlobal("fetch", wire);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("provider budgets at the network boundary", () => {
  it.each([
    ["cancel the first", 0, "cancelled"],
    ["cancel the second", 1, "cancelled"],
    ["expire the first", 0, "read_deadline"],
    ["exhaust the first", 0, "provider_request_limit"],
  ] as const)(
    "isolates identical lookups when we %s request",
    async (mode, failed, code) => {
      vi.useFakeTimers();
      const started = [deferred(), deferred()];
      const replies = [deferred<Response>(), deferred<Response>()];
      const signals: AbortSignal[] = [];
      wire.mockImplementation((_url, options) => {
        const index = signals.length;
        const signal = options!.signal!;
        signals.push(signal);
        signal.addEventListener(
          "abort",
          () => replies[index]!.reject(signal.reason),
          { once: true },
        );
        started[index]!.resolve();
        return replies[index]!.promise;
      });
      const controllers = [new AbortController(), new AbortController()];
      const exhaust = deferred();
      const exhausted = deferred();
      const lookup = () =>
        getRateWithBacktracking({
          seriesKey: "isolated-series",
          backtrackedFallbackCacheKey: "isolated-fallback",
          date: new Date("2026-01-01Z"),
          fetchRate: async () => Number(await (await request()).text()),
        });
      const load = (index: number) =>
        withResourceRequest(controllers[index]!.signal, async () => {
          startReadBudget();
          const lookups = Promise.all([lookup(), lookup()]);
          if (index === 0 && mode === "exhaust the first") {
            // A separate calculation in this request uses its remaining budget.
            void exhaust.promise.then(() => {
              try {
                for (let i = 0; i < 250; i++) consumeProviderAttempt();
              } catch {
                // The budget aborts the pending provider fetch as well.
              } finally {
                exhausted.resolve();
              }
            });
          }
          expect(await lookups).toEqual([1, 1]);
          // One real attempt per request leaves all 249 other attempts available.
          for (let i = 0; i < 249; i++) consumeProviderAttempt();
          checkResourceBudget();
          return new Response();
        });
      const first = load(0);
      await started[0]!.promise;
      if (code === "read_deadline") await vi.advanceTimersByTimeAsync(30_000);
      const second = load(1);
      const results = Promise.all([first, second]);
      try {
        await vi.waitFor(() => expect(wire).toHaveBeenCalledTimes(2));
        await started[1]!.promise;
        if (code === "read_deadline") await vi.advanceTimersByTimeAsync(30_000);
        else if (code === "provider_request_limit") {
          exhaust.resolve();
          await exhausted.promise;
        } else controllers[failed]!.abort();
        expect(signals[failed]!.aborted).toBe(true);
        expect(signals[1 - failed]!.aborted).toBe(false);
        replies[1 - failed]!.resolve(new Response("1"));
        const responses = await results;
        expect(responses[failed]!.status).toBe(
          code === "provider_request_limit" ? 429 : 503,
        );
        expect(
          responses[failed]!.headers.get("X-Cashfolio-Resource-Limit"),
        ).toBe(code);
        expect(responses[1 - failed]!.status).toBe(200);
        expect(wire).toHaveBeenCalledTimes(2);
        expect(
          cache.storeMissedAttemptForSeriesTimestamp,
        ).not.toHaveBeenCalled();
        expect(cache.storeBacktrackedFallbackInCache).not.toHaveBeenCalled();
      } finally {
        for (const controller of controllers) controller.abort();
        exhaust.resolve();
        await results;
      }
    },
  );

  it("loads 120 cold-cache months with three securities through automatic sequential batches", async () => {
    const range = {
      granularity: "month" as const,
      minDate: new Date("2016-11-01Z"),
      maxDate: new Date("2026-10-29Z"),
    };
    const load = async (periods: string[]) => {
      for (const period of periods) {
        for (const symbol of ["AAPL", "MSFT", "GOOG"]) {
          await getRateWithBacktracking({
            seriesKey: `cold:${symbol}`,
            backtrackedFallbackCacheKey: `cold:${symbol}:${period}`,
            date: new Date(`${period}-28Z`),
            fetchRate: async () => Number(await (await request()).text()),
          });
        }
      }
    };
    const oversized = await run(() =>
      load(getHistoryWindow({ ...range, pageSize: 120 }).values),
    );
    expect(oversized.status).toBe(429);
    expect(wire).toHaveBeenCalledTimes(250);
    wire.mockClear();
    const history = await loadCompleteHistory(
      {
        accountBookId: "book",
        mode: "month",
        locale: "en-CH",
        cashFlowScope: "total",
        incomeScope: "total",
        expenseScope: "total",
        gainLossScope: "total",
        netWorthScope: "total",
      },
      async (args) => {
        const page = getHistoryWindow({
          ...range,
          before: args.before,
          pageSize: args.pageSize,
        });
        const attemptsBefore = wire.mock.calls.length;
        const response = await run(() => load(page.values));
        expect(response.status).toBe(200);
        await response.text();
        expect(wire.mock.calls.length - attemptsBefore).toBe(36);
        const total = {
          value: "total" as const,
          kind: "total" as const,
          label: "Total",
        };
        return {
          revision: "r1",
          nextBefore: page.nextBefore,
          referenceCurrency: "CHF",
          hasCashAccounts: true,
          openingBalancePoint: page.nextBefore
            ? null
            : {
                date: "2016-10-31",
                label: "Opening Balance",
                assets: 0,
                liabilities: 0,
                netWorth: 0,
              },
          points: page.values.map((periodValue) => ({
            periodValue,
            periodLabel: periodValue,
            periodEndDate: `${periodValue}-28`,
            assets: 1,
            liabilities: 0,
            netWorth: 1,
            totalReturn: 1,
            savings: 1,
            cashFlow: 1,
            income: 1,
            expenses: 0,
            gainsLosses: 0,
          })),
          scopeSelection: {
            cashFlow: "total",
            income: "total",
            expenses: "total",
            gainsLosses: "total",
            netWorth: "total",
          },
          scopeOptions: {
            cashFlow: [total],
            income: [total],
            expenses: [total],
            gainsLosses: [total],
            netWorth: [total],
          },
        };
      },
      new AbortController().signal,
    );
    const loaded = history.points.map((point) => point.periodValue);
    expect(loaded).toHaveLength(120);
    expect(new Set(loaded).size).toBe(120);
    expect(loaded[0]).toBe("2016-11");
    expect(loaded.at(-1)).toBe("2026-10");
    expect(wire).toHaveBeenCalledTimes(360);
  });
  it("does not charge cache hits or duplicate in-flight lookups", async () => {
    const date = new Date("2026-01-01Z");
    const lookup = () =>
      getRateWithBacktracking({
        seriesKey: "test-series",
        backtrackedFallbackCacheKey: "test-fallback",
        date,
        fetchRate: async () => Number(await (await request()).text()),
      });
    const response = await run(async () => {
      expect(await Promise.all([lookup(), lookup()])).toEqual([1, 1]);
    });
    await response.text();
    expect(wire).toHaveBeenCalledOnce();
    cache.getCachedRate.mockResolvedValue({
      rate: 1,
      timestamp: date.getTime(),
    });
    await (
      await run(async () => {
        await lookup();
      })
    ).text();
    expect(wire).toHaveBeenCalledOnce();
  });
  it("charges actual backtracking attempts separately", async () => {
    let attempt = 0;
    const response = await run(async () => {
      expect(
        await getRateWithBacktracking({
          seriesKey: "backtrack",
          backtrackedFallbackCacheKey: "fallback",
          date: new Date("2026-01-01Z"),
          fetchRate: async () => {
            await (await request()).text();
            return ++attempt < 3 ? null : 1;
          },
        }),
      ).toBe(1);
    });
    await response.text();
    expect(wire).toHaveBeenCalledTimes(3);
  });
  it("charges each Marketstack rate-limit retry as an HTTP attempt", async () => {
    vi.stubEnv("MARKETSTACK_API_KEY", "test-key");
    wire
      .mockResolvedValueOnce(new Response("Rate limited", { status: 429 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: [{ close: 180, currency: "USD" }] }),
        ),
      );
    const response = await run(async () => {
      expect(
        await fetchSecurityPriceFromMarketstack(
          "AAPL",
          "USD",
          new Date("2026-01-01Z"),
        ),
      ).toBe(180);
    });
    await response.text();
    expect(wire).toHaveBeenCalledTimes(2);
  });
  it("counts retries against the same incoming request budget", async () => {
    vi.stubEnv("MARKETSTACK_API_KEY", "test-key");
    wire.mockResolvedValue(new Response("Rate limited", { status: 429 }));
    const response = await run(async () => {
      for (let i = 0; i < 249; i++) consumeProviderAttempt();
      await fetchSecurityPriceFromMarketstack(
        "AAPL",
        "USD",
        new Date("2026-01-01Z"),
      );
    });
    expect(response.status).toBe(429);
    expect(response.headers.get("X-Cashfolio-Resource-Limit")).toBe(
      "provider_request_limit",
    );
    expect(wire).toHaveBeenCalledOnce();
  });
  it("aborts pending network work when the read deadline expires", async () => {
    vi.useFakeTimers();
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    wire.mockImplementation(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
          started();
        }),
    );
    const response = run(async () => {
      await request();
    });
    await ready;
    await vi.advanceTimersByTimeAsync(60_000);
    expect((await response).status).toBe(503);
    expect((await response).headers.get("X-Cashfolio-Resource-Limit")).toBe(
      "read_deadline",
    );
  });
});
