import { describe, expect, test, vi } from "vitest";
import { getRateWithBacktracking } from "./backtracking";
import { NO_DATA_FETCH_RESULT } from "./types";

function createDeps() {
  return {
    maxBacktrackDays: 3,
    backtrackedFallbackTtlSeconds: 3600,
    backtrackedNoDataFallbackTtlSeconds: 300,
    toSeriesTimestamp: (date: Date) =>
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    toUtcDay: (date: Date) =>
      new Date(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
      ),
    subUtcDay: (date: Date) => new Date(date.getTime() - 24 * 60 * 60 * 1000),
    getCachedRate: vi.fn().mockResolvedValue(null),
    storeCachedRate: vi.fn().mockResolvedValue(undefined),
    getBacktrackedFallbackFromCache: vi.fn().mockResolvedValue(null),
    storeBacktrackedFallbackInCache: vi.fn().mockResolvedValue(undefined),
    clearBacktrackedFallbackFromCache: vi.fn().mockResolvedValue(undefined),
  };
}

describe("getRateWithBacktracking", () => {
  test("returns exact cached hit and clears stale fallback cache", async () => {
    const deps = createDeps();
    const requestedDate = new Date("2026-03-28T10:00:00.000Z");
    const requestedTimestamp = deps.toSeriesTimestamp(requestedDate);

    deps.getCachedRate.mockResolvedValueOnce({
      rate: 1.234,
      timestamp: requestedTimestamp,
    });

    const fetchRate = vi.fn().mockResolvedValue(999);

    const result = await getRateWithBacktracking(
      {
        seriesKey: "fx:key",
        backtrackedFallbackCacheKey: "fx:fallback:key",
        date: requestedDate,
        fetchRate,
      },
      deps,
    );

    expect(result).toBe(1.234);
    expect(fetchRate).not.toHaveBeenCalled();
    expect(deps.clearBacktrackedFallbackFromCache).toHaveBeenCalledWith(
      "fx:fallback:key",
    );
  });

  test("reuses cached backtracked fallback rate without provider call", async () => {
    const deps = createDeps();
    deps.getBacktrackedFallbackFromCache.mockResolvedValueOnce({
      kind: "rate",
      rate: 0.88,
      sourceTimestamp: Date.UTC(2026, 2, 27),
    });

    const fetchRate = vi.fn().mockResolvedValue(999);

    const result = await getRateWithBacktracking(
      {
        seriesKey: "fx:key",
        backtrackedFallbackCacheKey: "fx:fallback:key",
        date: new Date("2026-03-28T00:00:00.000Z"),
        fetchRate,
      },
      deps,
    );

    expect(result).toBe(0.88);
    expect(fetchRate).not.toHaveBeenCalled();
  });

  test("stores backtracked fallback after fetch and reuses it on next request", async () => {
    const deps = createDeps();
    const fallbackCache = new Map<
      string,
      { kind: "rate"; rate: number; sourceTimestamp: number }
    >();

    deps.getBacktrackedFallbackFromCache.mockImplementation(async (key) => {
      return fallbackCache.get(key) ?? null;
    });
    deps.storeBacktrackedFallbackInCache.mockImplementation(
      async (key, entry) => {
        if (entry.kind === "rate") {
          fallbackCache.set(key, entry);
        }
      },
    );

    const requestedDate = new Date("2026-03-28T00:00:00.000Z");
    const fetchRate = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(0.91);

    const firstResult = await getRateWithBacktracking(
      {
        seriesKey: "fx:key",
        backtrackedFallbackCacheKey: "fx:fallback:key",
        date: requestedDate,
        fetchRate,
      },
      deps,
    );

    expect(firstResult).toBe(0.91);
    expect(fetchRate).toHaveBeenCalledTimes(2);

    const secondFetchRate = vi.fn().mockResolvedValue(999);
    const secondResult = await getRateWithBacktracking(
      {
        seriesKey: "fx:key",
        backtrackedFallbackCacheKey: "fx:fallback:key",
        date: requestedDate,
        fetchRate: secondFetchRate,
      },
      deps,
    );

    expect(secondResult).toBe(0.91);
    expect(secondFetchRate).not.toHaveBeenCalled();
  });

  test("stores explicit no-data fallback and returns null", async () => {
    const deps = createDeps();
    const fetchRate = vi.fn().mockResolvedValue(NO_DATA_FETCH_RESULT);

    const result = await getRateWithBacktracking(
      {
        seriesKey: "fx:key",
        backtrackedFallbackCacheKey: "fx:fallback:key",
        date: new Date("2026-03-28T00:00:00.000Z"),
        fetchRate,
      },
      deps,
    );

    expect(result).toBeNull();
    expect(deps.storeBacktrackedFallbackInCache).toHaveBeenCalledWith(
      "fx:fallback:key",
      { kind: "noData" },
      300,
    );
  });
});
