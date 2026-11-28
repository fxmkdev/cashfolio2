import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encodeMoneyCache } from "../../money-cache-codec";
import { withUserResourceRequest } from "../../test-support/resource-request";
import { deferred } from "../../test-support/deferred";
import {
  cleanupHistoryMetricsCache,
  createMetrics,
  getOrLoadPeriodHistoryPointMetrics,
  getRedisClient,
  loadPeriodHistoryPointMetricsWithCacheability,
  prisma,
  readPeriodHistoryMetricsBatch,
  redisClient,
  redisState,
  resetHistoryMetricsCache,
} from "./period-history-metrics-cache.server.test-support";

const batchArgs = {
  accountBookId: "book-1",
  periods: ["2026-03", "2026-04"],
  generation: "gen-1",
};
const input = (period: string) => ({
  accountBookId: batchArgs.accountBookId,
  period,
});
const key = (period: string) =>
  `period:history:metrics:v15:preview-app-123:book-1:gen-1:${period}:total`;

describe("History batch metrics cache", () => {
  beforeEach(resetHistoryMetricsCache);
  afterEach(cleanupHistoryMetricsCache);

  it("reads a warm batch with one MGET and no point reads, revisions, or calculations", async () => {
    for (const period of batchArgs.periods)
      await getOrLoadPeriodHistoryPointMetrics(input(period));
    vi.clearAllMocks();
    const batch = await readPeriodHistoryMetricsBatch(batchArgs);
    const points = await Promise.all(
      batchArgs.periods.map((period) => batch.load(input(period))),
    );
    expect(points).toEqual([createMetrics(), createMetrics()]);
    expect(redisClient.mGet).toHaveBeenCalledExactlyOnceWith(
      batchArgs.periods.map(key),
    );
    expect(redisClient.get).not.toHaveBeenCalled();
    expect(prisma.accountBook.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(
      loadPeriodHistoryPointMetricsWithCacheability,
    ).not.toHaveBeenCalled();
    expect(batch.stats).toMatchObject({
      hits: 2,
      misses: 0,
      uncacheablePoints: 0,
    });
  });

  it.each(["missing", "malformed", "oversized", "invalid"])(
    "calculates only the %s point",
    async (kind) => {
      redisState.kv.set(
        key("2026-03"),
        JSON.stringify(encodeMoneyCache(createMetrics())),
      );
      if (kind !== "missing")
        redisState.kv.set(
          key("2026-04"),
          kind === "malformed"
            ? "{"
            : kind === "oversized"
              ? " ".repeat(512 * 1024 + 1)
              : "{}",
        );
      const batch = await readPeriodHistoryMetricsBatch(batchArgs);
      await Promise.all(
        batchArgs.periods.map((period) => batch.load(input(period))),
      );
      expect(
        loadPeriodHistoryPointMetricsWithCacheability,
      ).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ period: "2026-04" }),
      );
      expect(batch.stats).toMatchObject({ hits: 1, misses: 1 });
    },
  );

  it("continues calculating after MGET fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    redisClient.mGet.mockRejectedValueOnce(new Error("Redis unavailable"));
    const batch = await readPeriodHistoryMetricsBatch(batchArgs);
    await Promise.all(
      batchArgs.periods.map((period) => batch.load(input(period))),
    );
    expect(loadPeriodHistoryPointMetricsWithCacheability).toHaveBeenCalledTimes(
      2,
    );
    vi.restoreAllMocks();
  });

  it("supports unavailable Redis and never persists non-permanent valuations", async () => {
    getRedisClient.mockResolvedValue(null);
    loadPeriodHistoryPointMetricsWithCacheability.mockResolvedValue({
      metrics: createMetrics(),
      cacheableFromPermanentValuationCache: false,
    });
    const batch = await readPeriodHistoryMetricsBatch(batchArgs);
    await batch.load(input("2026-03"));
    expect(batch.stats.uncacheablePoints).toBe(1);
    expect(redisClient.setEx).not.toHaveBeenCalled();
    expect(prisma.accountBook.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it("skips writes if the book revision changed during a miss", async () => {
    const batch = await readPeriodHistoryMetricsBatch(batchArgs);
    prisma.accountBook.findUniqueOrThrow.mockResolvedValue({
      periodCacheRevision: "new-revision",
    });
    await batch.load(input("2026-03"));
    expect(redisClient.setEx).not.toHaveBeenCalled();
  });

  it("keeps a shared miss alive for the remaining same-user subscriber", async () => {
    const ready = deferred();
    const release = deferred();
    loadPeriodHistoryPointMetricsWithCacheability.mockImplementation(
      async () => {
        ready.resolve();
        await release.promise;
        return {
          metrics: createMetrics(),
          cacheableFromPermanentValuationCache: true,
        };
      },
    );
    const controller = new AbortController();
    const load = async () => {
      const batch = await readPeriodHistoryMetricsBatch(batchArgs);
      await batch.load(input("2026-03"));
    };
    const first = withUserResourceRequest("user", load, controller.signal);
    await ready.promise;
    const second = withUserResourceRequest("user", load);
    try {
      await vi.waitFor(() => expect(redisClient.mGet).toHaveBeenCalledTimes(2));
      await vi.advanceTimersByTimeAsync(0);
      controller.abort();
      expect((await first).status).toBe(503);
      release.resolve();
      expect((await second).status).toBe(200);
      expect(
        loadPeriodHistoryPointMetricsWithCacheability,
      ).toHaveBeenCalledOnce();
    } finally {
      controller.abort();
      release.resolve();
      await Promise.allSettled([first, second]);
    }
  });
});
