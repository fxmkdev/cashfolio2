import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkResourceBudget,
  getResourceSignal,
  withResourceRequest,
} from "../../resource-context.server";
import { deferred } from "../../test-support/deferred";
import { withUserResourceRequest } from "../../test-support/resource-request";
import {
  cleanupBaseDataCache,
  periodBaseCache,
  prisma,
  redisClient,
  redisState,
  resetBaseDataCache,
} from "./period-base-data-cache.server.test-support";

describe("period base-data cache", () => {
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
      periodBaseCache.getOrLoadPeriodBaseData({
        accountBookId: "book-1",
        period: "2026-02",
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
      expect(prisma.accountGroup.findMany).toHaveBeenCalledOnce();
      expect(redisClient.setEx).toHaveBeenCalledOnce();
    } finally {
      controller.abort();
      release.resolve();
      await Promise.allSettled([first, second]);
    }
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
        await periodBaseCache.getOrLoadPeriodBaseData({
          accountBookId: "book-1",
          period: "2026-02",
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
      expect(prisma.accountGroup.findMany).toHaveBeenCalledTimes(1);
      expect(redisClient.setEx).toHaveBeenCalledTimes(1);
    } finally {
      controller.abort();
      release.resolve();
      await Promise.allSettled([first, second]);
    }
  });
  beforeEach(resetBaseDataCache);
  afterEach(cleanupBaseDataCache);

  it("deduplicates concurrent misses with the same committed revision", async () => {
    redisClient.get.mockImplementation(async (key: string) => {
      await Promise.resolve();
      return redisState.kv.get(key) ?? null;
    });

    await Promise.all([
      periodBaseCache.getOrLoadPeriodBaseData({
        accountBookId: "book-1",
        period: "2026-02",
      }),
      periodBaseCache.getOrLoadPeriodBaseData({
        accountBookId: "book-1",
        period: "2026-02",
      }),
    ]);

    expect(prisma.accountGroup.findMany).toHaveBeenCalledTimes(1);
  });

  it("does not share inflight preset loads across UTC-day boundaries", async () => {
    let releaseGet: (() => void) | undefined;
    const getGate = new Promise<void>((resolve) => {
      releaseGet = resolve;
    });
    redisClient.get.mockImplementation(async (key: string) => {
      await getGate;
      return redisState.kv.get(key) ?? null;
    });

    const first = periodBaseCache.getOrLoadPeriodBaseData({
      accountBookId: "book-1",
      period: "mtd",
    });
    vi.setSystemTime(new Date("2026-05-02T12:00:00.000Z"));
    const second = periodBaseCache.getOrLoadPeriodBaseData({
      accountBookId: "book-1",
      period: "mtd",
    });

    releaseGet?.();
    await Promise.all([first, second]);

    expect(prisma.accountGroup.findMany).toHaveBeenCalledTimes(2);
  });

  it("does not join a pre-commit inflight load even when cleanup was never called", async () => {
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    prisma.accountGroup.findMany.mockImplementationOnce(async () => {
      started();
      await gate;
      return [];
    });
    const args = { accountBookId: "book-1", period: "2026-02" };
    const oldLoad = periodBaseCache.getOrLoadPeriodBaseData(args);
    await ready;
    prisma.accountBook.findUniqueOrThrow.mockResolvedValue({
      periodCacheRevision: "new-revision",
      classificationSchemes: [],
      referenceCurrency: "EUR",
      startDate: new Date("2026-01-01T00:00:00Z"),
    });
    try {
      const newResult = await periodBaseCache.getOrLoadPeriodBaseData(args);
      expect(newResult.referenceCurrency).toBe("EUR");
    } finally {
      release();
      await oldLoad;
    }
    // The old writer can finish after the new writer without poisoning its key.
    const result = await periodBaseCache.getOrLoadPeriodBaseData(args);
    expect(result.referenceCurrency).toBe("EUR");
    expect(prisma.accountGroup.findMany).toHaveBeenCalledTimes(2);
  });
});
