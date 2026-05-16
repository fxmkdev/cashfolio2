import { getRedisClient } from "../../redis.server";
import {
  PERIOD_CACHE_TTL_SECONDS,
  getPeriodCacheEnvOrThrowWhenRedisAvailable,
  getPeriodCacheGeneration,
  resolvePeriodCachePeriodKey,
} from "./period-cache";
import {
  loadPeriodHistoryPointMetricsWithCacheability,
  type PeriodHistoryPointMetrics,
  type HistoryValuationContext,
} from "./period-history-point-metrics.server";
import type { HistoryMetricScopeFilter } from "./period-history-scopes.server";
import {
  isHistoryScopeSelection,
  type HistoryScopeOption,
} from "../../shared/history-scope";

const PERIOD_HISTORY_METRICS_CACHE_ENTRY_PREFIX = "period:history:metrics:v1";
const PERIOD_HISTORY_METRICS_CACHE_MAX_SERIALIZED_BYTES = 512 * 1024;

const inflightByCacheKey = new Map<
  string,
  Promise<PeriodHistoryPointMetrics>
>();

let hasWarnedHistoryMetricsCacheReadFailure = false;
let hasWarnedHistoryMetricsCacheWriteFailure = false;

function getScopeKey(
  metricScopeFilter: HistoryMetricScopeFilter | undefined,
): string {
  if (!metricScopeFilter) {
    return "total";
  }

  return `${metricScopeFilter.metric}:${metricScopeFilter.scope}`;
}

function getHistoryMetricsCacheEntryKey(args: {
  cacheEnv: string;
  accountBookId: string;
  generation: string;
  periodCacheKey: string;
  scopeKey: string;
}) {
  return [
    PERIOD_HISTORY_METRICS_CACHE_ENTRY_PREFIX,
    args.cacheEnv,
    args.accountBookId,
    args.generation,
    args.periodCacheKey,
    args.scopeKey,
  ].join(":");
}

function isHistoryScopeOption(value: unknown): value is HistoryScopeOption {
  if (typeof value !== "object" || value == null) {
    return false;
  }

  const option = value as Partial<HistoryScopeOption>;
  return (
    isHistoryScopeSelection(option.value) &&
    typeof option.label === "string" &&
    (option.kind === "total" ||
      option.kind === "group" ||
      option.kind === "account" ||
      option.kind === "gainLoss")
  );
}

function isHistoryScopeOptionArray(
  value: unknown,
): value is HistoryScopeOption[] {
  return Array.isArray(value) && value.every(isHistoryScopeOption);
}

function isHistoryMetricsCacheEntry(
  value: unknown,
): value is PeriodHistoryPointMetrics {
  if (typeof value !== "object" || value == null) {
    return false;
  }

  const record = value as Partial<PeriodHistoryPointMetrics>;
  return (
    typeof record.totalReturn === "number" &&
    typeof record.savings === "number" &&
    typeof record.income === "number" &&
    typeof record.expenses === "number" &&
    typeof record.gainsLosses === "number" &&
    typeof record.assets === "number" &&
    typeof record.liabilities === "number" &&
    typeof record.netWorth === "number" &&
    typeof record.scopeOptions === "object" &&
    record.scopeOptions != null &&
    isHistoryScopeOptionArray(record.scopeOptions.income) &&
    isHistoryScopeOptionArray(record.scopeOptions.expenses) &&
    isHistoryScopeOptionArray(record.scopeOptions.gainsLosses) &&
    isHistoryScopeOptionArray(record.scopeOptions.assets) &&
    isHistoryScopeOptionArray(record.scopeOptions.liabilities) &&
    (record.scopedMetricValue === undefined ||
      typeof record.scopedMetricValue === "number")
  );
}

export async function getOrLoadPeriodHistoryPointMetrics(args: {
  accountBookId: string;
  period: string;
  metricScopeFilter?: HistoryMetricScopeFilter;
  valuationContext?: HistoryValuationContext;
}): Promise<PeriodHistoryPointMetrics> {
  const redis = await getRedisClient();
  if (!redis) {
    const result = await loadPeriodHistoryPointMetricsWithCacheability({
      accountBookId: args.accountBookId,
      period: args.period,
      metricScopeFilter: args.metricScopeFilter,
      valuationContext: args.valuationContext,
    });
    return result.metrics;
  }

  const cacheEnv = getPeriodCacheEnvOrThrowWhenRedisAvailable();
  const generation = await getPeriodCacheGeneration({
    cacheEnv,
    accountBookId: args.accountBookId,
    redis,
  });
  const periodCacheKey = await resolvePeriodCachePeriodKey({
    accountBookId: args.accountBookId,
    periodValue: args.period,
  });
  const cacheKey = getHistoryMetricsCacheEntryKey({
    cacheEnv,
    accountBookId: args.accountBookId,
    generation,
    periodCacheKey,
    scopeKey: getScopeKey(args.metricScopeFilter),
  });

  const existingInflight = inflightByCacheKey.get(cacheKey);
  if (existingInflight) {
    return existingInflight;
  }

  const loadPromise = (async () => {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached) as unknown;
        if (isHistoryMetricsCacheEntry(parsed)) {
          return parsed;
        }
      }
    } catch (error) {
      if (!hasWarnedHistoryMetricsCacheReadFailure) {
        console.warn(
          "Failed to read period history metrics cache entry; continuing uncached.",
          error,
        );
        hasWarnedHistoryMetricsCacheReadFailure = true;
      }
    }

    const result = await loadPeriodHistoryPointMetricsWithCacheability({
      accountBookId: args.accountBookId,
      period: args.period,
      metricScopeFilter: args.metricScopeFilter,
      valuationContext: args.valuationContext,
    });

    if (!result.cacheableFromPermanentValuationCache) {
      return result.metrics;
    }

    try {
      const serialized = JSON.stringify(result.metrics);
      if (
        Buffer.byteLength(serialized, "utf8") <=
        PERIOD_HISTORY_METRICS_CACHE_MAX_SERIALIZED_BYTES
      ) {
        await redis.setEx(cacheKey, PERIOD_CACHE_TTL_SECONDS, serialized);
      }
    } catch (error) {
      if (!hasWarnedHistoryMetricsCacheWriteFailure) {
        console.warn(
          "Failed to write period history metrics cache entry; continuing uncached.",
          error,
        );
        hasWarnedHistoryMetricsCacheWriteFailure = true;
      }
    }

    return result.metrics;
  })();

  inflightByCacheKey.set(cacheKey, loadPromise);
  try {
    return await loadPromise;
  } finally {
    inflightByCacheKey.delete(cacheKey);
  }
}
