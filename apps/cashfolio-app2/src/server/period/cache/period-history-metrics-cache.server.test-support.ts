import { toMoney } from "../../../shared/money";

import { vi } from "vitest";

const redisState = vi.hoisted(() => ({
  kv: new Map<string, string>(),
}));

const redisClient = vi.hoisted(() => ({
  get: vi.fn(async (key: string) => redisState.kv.get(key) ?? null),
  setEx: vi.fn(async (key: string, _ttl: number, value: string) => {
    redisState.kv.set(key, value);
  }),
}));

const getRedisClient = vi.hoisted(() =>
  vi.fn<() => Promise<typeof redisClient | null>>(async () => redisClient),
);

const prisma = vi.hoisted(() => ({
  accountBook: { findUniqueOrThrow: vi.fn() },
}));

vi.mock("../../../prisma.server", () => ({ prisma }));

const loadPeriodHistoryPointMetricsWithCacheability = vi.hoisted(() => vi.fn());

vi.mock("../../../redis.server", () => ({
  getRedisClient,
}));

vi.mock("../history/period-history-point-metrics.server", () => ({
  loadPeriodHistoryPointMetricsWithCacheability,
}));

function createMetrics(overrides = {}) {
  return {
    totalReturn: toMoney(10),
    savings: toMoney(8),
    cashFlow: toMoney(6),
    income: toMoney(12),
    expenses: toMoney(4),
    gainsLosses: toMoney(2),
    assets: toMoney(100),
    liabilities: toMoney(30),
    netWorth: toMoney(70),
    scopeOptions: {
      cashFlow: [],
      income: [],
      expenses: [],
      gainsLosses: [],
      netWorth: [],
    },
    ...overrides,
  };
}
const resetHistoryMetricsCache = () => {
  redisState.kv.clear();
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-05-11T14:30:00.000Z"));
  process.env.PERIOD_BASE_CACHE_ENV = "preview-app-123";
  prisma.accountBook.findUniqueOrThrow.mockResolvedValue({
    periodCacheRevision: "gen-1",
  });
  loadPeriodHistoryPointMetricsWithCacheability.mockResolvedValue({
    metrics: createMetrics(),
    cacheableFromPermanentValuationCache: true,
  });
};
const cleanupHistoryMetricsCache = () => {
  vi.useRealTimers();
  delete process.env.PERIOD_BASE_CACHE_ENV;
};
export {
  cleanupHistoryMetricsCache,
  createMetrics,
  getOrLoadPeriodHistoryPointMetrics,
  getRedisClient,
  loadPeriodHistoryPointMetricsWithCacheability,
  prisma,
  redisClient,
  redisState,
  resetHistoryMetricsCache,
};

// Register mocks before importing the tested modules and their dependencies.
const { getOrLoadPeriodHistoryPointMetrics } =
  await import("./period-history-metrics-cache.server");
