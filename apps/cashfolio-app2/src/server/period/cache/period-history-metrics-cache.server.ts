import {
  createCacheFailureReporter,
  readValidatedMoneyCache,
} from "../../money-cache-read";
import {
  checkResourceBudget,
  createUserScopedSharedWork,
  isSharedResourceWork,
} from "../../resource-context.server";
import { getHistoryMetricsCacheEntryKey } from "../../../shared/accounts/book-cache-keys";
import Decimal from "decimal.js";
import { isReportingGrouping } from "../../../shared/reporting/reporting-grouping";
import { encodeMoneyCache } from "../../money-cache-codec";
import { moneyIsFinite, type Money } from "../../../shared/money";
import { getRedisClient } from "../../../redis.server";
import {
  PERIOD_CACHE_TTL_SECONDS,
  getPeriodCacheEnvOrThrowWhenRedisAvailable,
  getPeriodCacheGeneration,
  resolvePeriodCachePeriodKey,
} from "./period-cache.server";
import {
  loadPeriodHistoryPointMetricsWithCacheability,
  type PeriodHistoryPointMetrics,
  type HistoryValuationContext,
} from "../history/period-history-point-metrics.server";
import type { HistoryMetricScopeFilter } from "../history/period-history-scopes.server";
import {
  isHistoryScopeSelection,
  type HistoryScopeOption,
} from "../../../shared/reporting/history-scope";

const PERIOD_HISTORY_METRICS_CACHE_MAX_SERIALIZED_BYTES = 512 * 1024;

const runSharedLoad = createUserScopedSharedWork<PeriodHistoryPointMetrics>();

const reportHistoryMetricsCacheReadFailure = createCacheFailureReporter(
  "Failed to read period history metrics cache entry; continuing uncached.",
);
const reportHistoryMetricsCacheWriteFailure = createCacheFailureReporter(
  "Failed to write period history metrics cache entry; continuing uncached.",
);

function getScopeKey(
  metricScopeFilter: HistoryMetricScopeFilter | undefined,
): string {
  if (!metricScopeFilter) {
    return "total";
  }

  return `${metricScopeFilter.metric}:${metricScopeFilter.scope}`;
}

function isHistoryScopeOption(value: unknown): value is HistoryScopeOption {
  if (typeof value !== "object" || value == null) {
    return false;
  }

  const option = value as Partial<HistoryScopeOption>;
  return (
    isHistoryScopeSelection(option.value) &&
    typeof option.label === "string" &&
    (option.grouping === undefined || isReportingGrouping(option.grouping)) &&
    (!option.value?.startsWith("gain-loss-account:") ||
      (typeof option.accountId === "string" &&
        option.value === `gain-loss-account:${option.accountId}`)) &&
    (option.legacyValues === undefined ||
      (Array.isArray(option.legacyValues) &&
        option.legacyValues.every((value) => typeof value === "string"))) &&
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

function isCachedMoney(value: unknown): value is Money {
  return Decimal.isDecimal(value) && moneyIsFinite(value as Money);
}

function isHistoryMetricsCacheEntry(
  value: unknown,
): value is PeriodHistoryPointMetrics {
  if (typeof value !== "object" || value == null) {
    return false;
  }

  const record = value as Partial<PeriodHistoryPointMetrics>;
  return (
    isCachedMoney(record.totalReturn) &&
    isCachedMoney(record.savings) &&
    isCachedMoney(record.cashFlow) &&
    isCachedMoney(record.income) &&
    isCachedMoney(record.expenses) &&
    isCachedMoney(record.gainsLosses) &&
    isCachedMoney(record.assets) &&
    isCachedMoney(record.liabilities) &&
    isCachedMoney(record.netWorth) &&
    typeof record.scopeOptions === "object" &&
    record.scopeOptions != null &&
    isHistoryScopeOptionArray(record.scopeOptions.cashFlow) &&
    isHistoryScopeOptionArray(record.scopeOptions.income) &&
    isHistoryScopeOptionArray(record.scopeOptions.expenses) &&
    isHistoryScopeOptionArray(record.scopeOptions.gainsLosses) &&
    isHistoryScopeOptionArray(record.scopeOptions.netWorth) &&
    (record.scopedMetricValue === undefined ||
      isCachedMoney(record.scopedMetricValue))
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
    accountBookId: args.accountBookId,
  });
  if (generation === null) {
    const result = await loadPeriodHistoryPointMetricsWithCacheability({
      accountBookId: args.accountBookId,
      period: args.period,
      metricScopeFilter: args.metricScopeFilter,
      valuationContext: args.valuationContext,
    });
    return result.metrics;
  }
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

  return runSharedLoad(cacheKey, async () => {
    const cached = await readValidatedMoneyCache({
      read: () => redis.get(cacheKey),
      maxBytes: PERIOD_HISTORY_METRICS_CACHE_MAX_SERIALIZED_BYTES,
      validate: (value: unknown): value is PeriodHistoryPointMetrics =>
        isHistoryMetricsCacheEntry(value),
      reportFailure: reportHistoryMetricsCacheReadFailure,
    });
    if (cached !== undefined) return cached;

    const result = await loadPeriodHistoryPointMetricsWithCacheability({
      accountBookId: args.accountBookId,
      period: args.period,
      metricScopeFilter: args.metricScopeFilter,
      valuationContext: isSharedResourceWork()
        ? undefined
        : args.valuationContext,
    });

    if (!result.cacheableFromPermanentValuationCache) {
      return result.metrics;
    }

    // Calculation may outlive a mutation. Never publish under an older revision.
    if (
      (await getPeriodCacheGeneration({
        accountBookId: args.accountBookId,
      })) !== generation
    ) {
      return result.metrics;
    }

    try {
      const serialized = JSON.stringify(encodeMoneyCache(result.metrics));
      if (
        Buffer.byteLength(serialized, "utf8") <=
        PERIOD_HISTORY_METRICS_CACHE_MAX_SERIALIZED_BYTES
      ) {
        checkResourceBudget();
        await redis.setEx(cacheKey, PERIOD_CACHE_TTL_SECONDS, serialized);
      }
    } catch (error) {
      reportHistoryMetricsCacheWriteFailure(error);
    }

    return result.metrics;
  });
}
