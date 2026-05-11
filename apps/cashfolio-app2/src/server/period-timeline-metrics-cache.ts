import { getRedisClient } from "../redis.server";
import {
  PERIOD_CACHE_TTL_SECONDS,
  getPeriodCacheEnvOrThrowWhenRedisAvailable,
  getPeriodCacheGeneration,
} from "./period-cache";
import {
  loadPeriodTimelinePointMetricsWithCacheability,
  type PeriodTimelinePointMetrics,
  type TimelineValuationContext,
} from "./period-timeline-point-metrics.server";
import type { TimelineMetricScopeFilter } from "./period-timeline-scopes.server";

const PERIOD_TIMELINE_METRICS_CACHE_ENTRY_PREFIX = "period:timeline:metrics:v1";
const PERIOD_TIMELINE_METRICS_CACHE_MAX_SERIALIZED_BYTES = 512 * 1024;

const inflightByCacheKey = new Map<
  string,
  Promise<PeriodTimelinePointMetrics>
>();

let hasWarnedTimelineMetricsCacheReadFailure = false;
let hasWarnedTimelineMetricsCacheWriteFailure = false;

function formatUtcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function getCurrentUtcDayKey(): string {
  return formatUtcDateKey(new Date());
}

function getScopeKey(
  metricScopeFilter: TimelineMetricScopeFilter | undefined,
): string {
  if (!metricScopeFilter) {
    return "total";
  }

  return `${metricScopeFilter.metric}:${metricScopeFilter.scope}`;
}

function getTimelineMetricsCacheEntryKey(args: {
  cacheEnv: string;
  accountBookId: string;
  generation: string;
  utcDay: string;
  periodValue: string;
  scopeKey: string;
}) {
  return [
    PERIOD_TIMELINE_METRICS_CACHE_ENTRY_PREFIX,
    args.cacheEnv,
    args.accountBookId,
    args.generation,
    args.utcDay,
    args.periodValue,
    args.scopeKey,
  ].join(":");
}

function isTimelineMetricsCacheEntry(
  value: unknown,
): value is PeriodTimelinePointMetrics {
  if (typeof value !== "object" || value == null) {
    return false;
  }

  const record = value as Partial<PeriodTimelinePointMetrics>;
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
    Array.isArray(record.scopeOptions.income) &&
    Array.isArray(record.scopeOptions.expenses) &&
    (record.scopedMetricValue === undefined ||
      typeof record.scopedMetricValue === "number")
  );
}

export async function getOrLoadPeriodTimelinePointMetrics(args: {
  accountBookId: string;
  period: string;
  metricScopeFilter?: TimelineMetricScopeFilter;
  valuationContext?: TimelineValuationContext;
}): Promise<PeriodTimelinePointMetrics> {
  const redis = await getRedisClient();
  if (!redis) {
    const result = await loadPeriodTimelinePointMetricsWithCacheability({
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
  const cacheKey = getTimelineMetricsCacheEntryKey({
    cacheEnv,
    accountBookId: args.accountBookId,
    generation,
    utcDay: getCurrentUtcDayKey(),
    periodValue: args.period,
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
        if (isTimelineMetricsCacheEntry(parsed)) {
          return parsed;
        }
      }
    } catch (error) {
      if (!hasWarnedTimelineMetricsCacheReadFailure) {
        console.warn(
          "Failed to read period timeline metrics cache entry; continuing uncached.",
          error,
        );
        hasWarnedTimelineMetricsCacheReadFailure = true;
      }
    }

    const result = await loadPeriodTimelinePointMetricsWithCacheability({
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
        PERIOD_TIMELINE_METRICS_CACHE_MAX_SERIALIZED_BYTES
      ) {
        await redis.setEx(cacheKey, PERIOD_CACHE_TTL_SECONDS, serialized);
      }
    } catch (error) {
      if (!hasWarnedTimelineMetricsCacheWriteFailure) {
        console.warn(
          "Failed to write period timeline metrics cache entry; continuing uncached.",
          error,
        );
        hasWarnedTimelineMetricsCacheWriteFailure = true;
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
