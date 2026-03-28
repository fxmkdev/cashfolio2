export type CurrencyLayerHistoricalResponse = {
  success: boolean;
  quotes?: Record<string, number>;
  error?: { code?: number; info?: string };
};

export type CoinLayerHistoricalResponse = {
  success: boolean;
  rates?: Record<string, number>;
  error?: { code?: number; info?: string };
};

export type MarketstackEodResponse = {
  data?: Array<{
    close?: number;
    currency?: string;
    exchange_currency?: string;
    exchange?: unknown;
  }>;
  error?: { code?: string | number; message?: string };
};

export type CachedRateResult = {
  rate: number;
  timestamp: number;
};

export type BacktrackedRateFallbackCacheEntry = {
  kind: "rate";
  rate: number;
  sourceTimestamp: number;
};

export type BacktrackedNoDataFallbackCacheEntry = {
  kind: "noData";
};

export type BacktrackedFallbackCacheEntry =
  | BacktrackedRateFallbackCacheEntry
  | BacktrackedNoDataFallbackCacheEntry;

export const NO_DATA_FETCH_RESULT = Symbol("fx-no-data-fetch-result");

export type NoDataFetchResult = typeof NO_DATA_FETCH_RESULT;
export type FetchRateResult = number | null | NoDataFetchResult;
