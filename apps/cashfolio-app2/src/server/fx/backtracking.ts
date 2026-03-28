import {
  BACKTRACKED_FALLBACK_TTL_SECONDS,
  BACKTRACKED_NO_DATA_FALLBACK_TTL_SECONDS,
  MAX_BACKTRACK_DAYS,
} from "./constants";
import { subUtcDay, toSeriesTimestamp, toUtcDay } from "./date-utils";
import {
  clearBacktrackedFallbackFromCache,
  getBacktrackedFallbackFromCache,
  getCachedRate,
  storeBacktrackedFallbackInCache,
  storeCachedRate,
} from "./cache";
import type {
  BacktrackedFallbackCacheEntry,
  CachedRateResult,
  FetchRateResult,
} from "./types";
import { NO_DATA_FETCH_RESULT } from "./types";

export type RateWithBacktrackingInput = {
  seriesKey: string;
  backtrackedFallbackCacheKey: string;
  date: Date;
  fetchRate: (date: Date) => Promise<FetchRateResult>;
  stopOnExplicitNoData?: boolean;
};

type RateWithBacktrackingDeps = {
  maxBacktrackDays: number;
  backtrackedFallbackTtlSeconds: number;
  backtrackedNoDataFallbackTtlSeconds: number;
  toSeriesTimestamp: (date: Date) => number;
  toUtcDay: (date: Date) => Date;
  subUtcDay: (date: Date) => Date;
  getCachedRate: (
    key: string,
    timestamp: number,
  ) => Promise<CachedRateResult | null>;
  storeCachedRate: (
    key: string,
    timestamp: number,
    rate: number,
  ) => Promise<void>;
  getBacktrackedFallbackFromCache: (
    key: string,
  ) => Promise<BacktrackedFallbackCacheEntry | null>;
  storeBacktrackedFallbackInCache: (
    key: string,
    entry: BacktrackedFallbackCacheEntry,
    ttlSeconds: number,
  ) => Promise<void>;
  clearBacktrackedFallbackFromCache: (key: string) => Promise<void>;
};

const defaultDeps: RateWithBacktrackingDeps = {
  maxBacktrackDays: MAX_BACKTRACK_DAYS,
  backtrackedFallbackTtlSeconds: BACKTRACKED_FALLBACK_TTL_SECONDS,
  backtrackedNoDataFallbackTtlSeconds: BACKTRACKED_NO_DATA_FALLBACK_TTL_SECONDS,
  toSeriesTimestamp,
  toUtcDay,
  subUtcDay,
  getCachedRate,
  storeCachedRate,
  getBacktrackedFallbackFromCache,
  storeBacktrackedFallbackInCache,
  clearBacktrackedFallbackFromCache,
};

export async function getRateWithBacktracking(
  args: RateWithBacktrackingInput,
  deps: RateWithBacktrackingDeps = defaultDeps,
): Promise<number | null> {
  const requestedTimestamp = deps.toSeriesTimestamp(args.date);
  const key = args.seriesKey;
  const backtrackedFallbackCacheKey = args.backtrackedFallbackCacheKey;
  const stopOnExplicitNoData = args.stopOnExplicitNoData ?? true;

  const cached = await deps.getCachedRate(key, requestedTimestamp);
  if (cached?.timestamp === requestedTimestamp) {
    await deps.clearBacktrackedFallbackFromCache(backtrackedFallbackCacheKey);
    return cached.rate;
  }

  const cachedBacktrackedFallback = await deps.getBacktrackedFallbackFromCache(
    backtrackedFallbackCacheKey,
  );
  if (cachedBacktrackedFallback) {
    if (cachedBacktrackedFallback.kind === "noData") {
      if (stopOnExplicitNoData) {
        return null;
      }
      await deps.clearBacktrackedFallbackFromCache(backtrackedFallbackCacheKey);
    } else {
      return cachedBacktrackedFallback.rate;
    }
  }

  let requestedDate = deps.toUtcDay(args.date);
  for (let i = 0; i <= deps.maxBacktrackDays; i++) {
    const currentTimestamp = deps.toSeriesTimestamp(requestedDate);
    if (cached && currentTimestamp <= cached.timestamp) {
      await deps.storeBacktrackedFallbackInCache(
        backtrackedFallbackCacheKey,
        {
          kind: "rate",
          rate: cached.rate,
          sourceTimestamp: cached.timestamp,
        },
        deps.backtrackedFallbackTtlSeconds,
      );
      return cached.rate;
    }

    const fetchedRate = await args.fetchRate(requestedDate);
    if (fetchedRate === NO_DATA_FETCH_RESULT) {
      if (stopOnExplicitNoData) {
        await deps.storeBacktrackedFallbackInCache(
          backtrackedFallbackCacheKey,
          { kind: "noData" },
          deps.backtrackedNoDataFallbackTtlSeconds,
        );
        return null;
      }
      requestedDate = deps.subUtcDay(requestedDate);
      continue;
    }

    if (typeof fetchedRate === "number") {
      try {
        await deps.storeCachedRate(
          key,
          deps.toSeriesTimestamp(requestedDate),
          fetchedRate,
        );
      } catch (error) {
        console.error(
          "Failed to cache FX rate",
          { key, requestedDate: requestedDate.toISOString() },
          error,
        );
      }

      if (currentTimestamp < requestedTimestamp) {
        await deps.storeBacktrackedFallbackInCache(
          backtrackedFallbackCacheKey,
          {
            kind: "rate",
            rate: fetchedRate,
            sourceTimestamp: currentTimestamp,
          },
          deps.backtrackedFallbackTtlSeconds,
        );
      } else {
        await deps.clearBacktrackedFallbackFromCache(
          backtrackedFallbackCacheKey,
        );
      }

      return fetchedRate;
    }

    requestedDate = deps.subUtcDay(requestedDate);
  }

  if (cached) {
    await deps.storeBacktrackedFallbackInCache(
      backtrackedFallbackCacheKey,
      {
        kind: "rate",
        rate: cached.rate,
        sourceTimestamp: cached.timestamp,
      },
      deps.backtrackedFallbackTtlSeconds,
    );
    return cached.rate;
  }

  return null;
}
