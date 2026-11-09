import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toMoney } from "../../../shared/money";
import {
  checkResourceBudget,
  getResourceSignal,
  withResourceRequest,
} from "../../resource-context.server";
import { deferred } from "../../test-support/deferred";
import { withUserResourceRequest } from "../../test-support/resource-request";
import {
  cleanupHistoryMetricsCache,
  createMetrics,
  getOrLoadPeriodHistoryPointMetrics,
  loadPeriodHistoryPointMetricsWithCacheability,
  prisma,
  redisClient,
  resetHistoryMetricsCache,
} from "./period-history-metrics-cache.server.test-support";

describe("period history metrics cache", () => {
  it("shares a same-user Redis miss after the initiating request cancels", async () => {
    const ready = deferred();
    const release = deferred();
    let jobSignal!: AbortSignal;
    redisClient.get.mockImplementationOnce(async () => {
      jobSignal = getResourceSignal()!;
      ready.resolve();
      await release.promise;
      checkResourceBudget();
      return null;
    });
    const controller = new AbortController();
    const load = () =>
      getOrLoadPeriodHistoryPointMetrics({
        accountBookId: "book-1",
        period: "2026-04",
      });
    const first = withUserResourceRequest(
      "user",
      async () => {
        await load();
      },
      controller.signal,
    );
    await ready.promise;
    const second = withUserResourceRequest("user", async () => {
      await load();
    });
    try {
      await vi.waitFor(() =>
        expect(prisma.accountBook.findUniqueOrThrow).toHaveBeenCalledTimes(2),
      );
      await vi.advanceTimersByTimeAsync(0);
      expect(redisClient.get).toHaveBeenCalledOnce();
      controller.abort();
      expect((await first).status).toBe(503);
      expect(jobSignal.aborted).toBe(false);
      release.resolve();
      expect((await second).status).toBe(200);
      expect(
        loadPeriodHistoryPointMetricsWithCacheability,
      ).toHaveBeenCalledOnce();
      expect(redisClient.setEx).toHaveBeenCalledOnce();
    } finally {
      controller.abort();
      release.resolve();
      await Promise.allSettled([first, second]);
    }
  });

  it("does not capture a caller's pending History valuation promises in shared work", async () => {
    const callerRate = deferred<{
      rate: ReturnType<typeof toMoney> | null;
      source: "missing";
    }>();
    const valuationContext = {
      exchangeRateByKey: new Map([["caller-rate", callerRate.promise]]),
    };
    const controller = new AbortController();
    await withUserResourceRequest(
      "user",
      async () => {
        await getOrLoadPeriodHistoryPointMetrics({
          accountBookId: "book-1",
          period: "2026-04",
          valuationContext,
        });
      },
      controller.signal,
    );
    expect(loadPeriodHistoryPointMetricsWithCacheability).toHaveBeenCalledWith(
      expect.objectContaining({ valuationContext: undefined }),
    );
    // The loader never waited for or retained this request-owned promise.
    controller.abort();
    callerRate.resolve({ rate: null, source: "missing" });
  });

  it("does not join another request's cancelled Redis miss", async () => {
    const ready = deferred();
    const release = deferred();
    redisClient.get.mockImplementationOnce(async () => {
      ready.resolve();
      await release.promise;
      checkResourceBudget();
      return null;
    });
    const controller = new AbortController();
    const load = (signal: AbortSignal) =>
      withResourceRequest(signal, async () => {
        await getOrLoadPeriodHistoryPointMetrics({
          accountBookId: "book-1",
          period: "2026-04",
        });
        return new Response();
      });
    const first = load(controller.signal);
    await ready.promise;
    const second = load(new AbortController().signal);
    try {
      await vi.waitFor(() => expect(redisClient.get).toHaveBeenCalledTimes(2));
      controller.abort();
      release.resolve();
      expect((await first).status).toBe(503);
      expect((await second).status).toBe(200);
      expect(
        loadPeriodHistoryPointMetricsWithCacheability,
      ).toHaveBeenCalledTimes(1);
      expect(redisClient.setEx).toHaveBeenCalledTimes(1);
    } finally {
      controller.abort();
      release.resolve();
      await Promise.allSettled([first, second]);
    }
  });
  beforeEach(resetHistoryMetricsCache);
  afterEach(cleanupHistoryMetricsCache);

  it("does not join or reuse metrics from a pre-commit inflight load", async () => {
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    loadPeriodHistoryPointMetricsWithCacheability.mockImplementationOnce(
      async () => {
        started();
        await gate;
        return {
          metrics: createMetrics({ income: toMoney("1.123456789123456789") }),
          cacheableFromPermanentValuationCache: true,
        };
      },
    );
    const args = { accountBookId: "book-1", period: "2026-04" };
    const oldLoad = getOrLoadPeriodHistoryPointMetrics(args);
    await ready;
    prisma.accountBook.findUniqueOrThrow.mockResolvedValue({
      periodCacheRevision: "gen-2",
    });
    try {
      expect(
        (await getOrLoadPeriodHistoryPointMetrics(args)).income.toString(),
      ).toBe("12");
    } finally {
      release();
      await oldLoad;
    }
    expect(
      (await getOrLoadPeriodHistoryPointMetrics(args)).income.toString(),
    ).toBe("12");
    expect(loadPeriodHistoryPointMetricsWithCacheability).toHaveBeenCalledTimes(
      2,
    );
  });
});
