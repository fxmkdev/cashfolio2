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
import { rethrowResourceError } from "../../resource-error";

type MetricsInput = {
  accountBookId: string;
  period: string;
  metricScopeFilter?: HistoryMetricScopeFilter;
  valuationContext?: HistoryValuationContext;
};

export type HistoryMetricsBatchStats = {
  cacheReadMs: number;
  calculationMs: number;
  hits: number;
  misses: number;
  uncacheablePoints: number;
};

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

export async function getOrLoadPeriodHistoryPointMetrics(
  args: MetricsInput,
): Promise<PeriodHistoryPointMetrics> {
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

  return loadMetricsAtRevision(args, { redis, generation, cacheKey });
}

function readMetrics(read: () => Promise<string | null>) {
  return readValidatedMoneyCache({
    read,
    maxBytes: PERIOD_HISTORY_METRICS_CACHE_MAX_SERIALIZED_BYTES,
    validate: isHistoryMetricsCacheEntry,
    reportFailure: reportHistoryMetricsCacheReadFailure,
  });
}

/** The revision must come from the authorized batch's database context. */
export async function readPeriodHistoryMetricsBatch(args: {
  accountBookId: string;
  periods: string[];
  generation: string;
  metricScopeFilter?: HistoryMetricScopeFilter;
}) {
  const stats: HistoryMetricsBatchStats = {
    cacheReadMs: 0,
    calculationMs: 0,
    hits: 0,
    misses: 0,
    uncacheablePoints: 0,
  };
  const started = performance.now();
  const redis = await getRedisClient();
  const cacheEnv = redis ? getPeriodCacheEnvOrThrowWhenRedisAvailable() : "";
  const keys = await Promise.all(
    args.periods.map(async (period) =>
      getHistoryMetricsCacheEntryKey({
        cacheEnv,
        accountBookId: args.accountBookId,
        generation: args.generation,
        periodCacheKey: await resolvePeriodCachePeriodKey({
          accountBookId: args.accountBookId,
          periodValue: period,
        }),
        scopeKey: getScopeKey(args.metricScopeFilter),
      }),
    ),
  );
  let encoded: (string | null)[] = [];
  if (redis && keys.length) {
    try {
      checkResourceBudget();
      encoded = await redis.mGet(keys);
      checkResourceBudget();
    } catch (error) {
      rethrowResourceError(error);
      reportHistoryMetricsCacheReadFailure(error);
    }
  }
  const cached = await Promise.all(
    keys.map((_key, index) => readMetrics(async () => encoded[index] ?? null)),
  );
  stats.hits = cached.filter((value) => value !== undefined).length;
  stats.misses = args.periods.length - stats.hits;
  stats.cacheReadMs = performance.now() - started;
  const indexByPeriod = new Map(
    args.periods.map((period, index) => [period, index]),
  );
  return {
    stats,
    async load(input: MetricsInput): Promise<PeriodHistoryPointMetrics> {
      const index = indexByPeriod.get(input.period);
      if (index === undefined || input.accountBookId !== args.accountBookId)
        throw new Error("History point is outside its cache batch.");
      const hit = cached[index];
      if (hit !== undefined) return hit;
      const calculationStarted = performance.now();
      try {
        if (redis)
          return await loadMetricsAtRevision(input, {
            redis,
            generation: args.generation,
            cacheKey: keys[index],
            stats,
          });
        const result =
          await loadPeriodHistoryPointMetricsWithCacheability(input);
        if (!result.cacheableFromPermanentValuationCache)
          stats.uncacheablePoints++;
        return result.metrics;
      } finally {
        stats.calculationMs += performance.now() - calculationStarted;
      }
    },
  };
}

async function loadMetricsAtRevision(
  args: MetricsInput,
  options: {
    redis: NonNullable<Awaited<ReturnType<typeof getRedisClient>>>;
    generation: string;
    cacheKey: string;
    stats?: HistoryMetricsBatchStats;
  },
): Promise<PeriodHistoryPointMetrics> {
  const { redis, generation, cacheKey, stats } = options;

  return runSharedLoad(cacheKey, async () => {
    // A concurrent request may have filled a miss after the batch MGET.
    const cached = await readMetrics(() => redis.get(cacheKey));
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
      if (stats) stats.uncacheablePoints++;
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
