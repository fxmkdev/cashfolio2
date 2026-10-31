import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  consumeProviderAttempt,
  createUserScopedSharedWork,
  getResourceSignal,
} from "./resource-context.server";
import { RESOURCE_LIMITS } from "../shared/resource-limits";
import { deferred } from "./test-support/deferred";
import { withUserResourceRequest } from "./test-support/resource-request";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
const consume = (count: number) => {
  for (let i = 0; i < count; i++) consumeProviderAttempt();
};

describe("independent subscriber and job budgets", () => {
  it.each([1, 2])(
    "charges %s prior attempts to late joiners and detaches only an exhausted request",
    async (prior) => {
      const shared = createUserScopedSharedWork<void>();
      const started = deferred();
      const release = deferred();
      let signal!: AbortSignal;
      const operation = vi.fn(async () => {
        signal = getResourceSignal()!;
        consume(prior);
        started.resolve();
        await release.promise;
        consumeProviderAttempt();
      });
      const first = withUserResourceRequest("user", async () => {
        await shared("key", operation);
        consume(RESOURCE_LIMITS.providerAttempts - prior - 1);
      });
      await started.promise;
      const joined = deferred();
      const second = withUserResourceRequest("user", async () => {
        consume(RESOURCE_LIMITS.providerAttempts - 1);
        const work = shared("key", operation);
        joined.resolve();
        await work;
      });
      await joined.promise;
      if (prior === 2) {
        // Catch-up itself exceeds this caller's remaining allowance.
        expect((await second).status).toBe(429);
        expect(signal.aborted).toBe(false);
      }
      release.resolve();
      const [a, b] = await Promise.all([first, second]);
      expect(a.status).toBe(200);
      expect(b.status).toBe(429);
      expect(b.headers.get("X-Cashfolio-Resource-Limit")).toBe(
        "provider_request_limit",
      );
      expect(operation).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("counts a physical attempt once when nested jobs reach the request through two paths", async () => {
    const leaf = createUserScopedSharedWork<number>();
    const outer = createUserScopedSharedWork<number>();
    const release = deferred<number>();
    const both = deferred();
    let parents = 0;
    const provider = vi.fn(async () => {
      consumeProviderAttempt();
      return release.promise;
    });
    const request = withUserResourceRequest("user", async () => {
      const load = (key: string) =>
        outer(key, async () => {
          const result = leaf("provider", provider);
          if (++parents === 2) both.resolve();
          return result;
        });
      expect(await Promise.all([load("one"), load("two")])).toEqual([5, 5]);
      consume(RESOURCE_LIMITS.providerAttempts - 1);
    });
    await both.promise;
    release.resolve(5);
    expect((await request).status).toBe(200);
    expect(provider).toHaveBeenCalledOnce();
  });

  it("enforces the shared job's own attempt cap", async () => {
    const shared = createUserScopedSharedWork<void>();
    const start = deferred();
    const release = deferred();
    let attempted = 0;
    const operation = async () => {
      start.resolve();
      await release.promise;
      for (let i = 0; i <= RESOURCE_LIMITS.providerAttempts; i++) {
        consumeProviderAttempt();
        attempted++;
      }
    };
    const a = withUserResourceRequest("user", async () => {
      await shared("key", operation);
    });
    await start.promise;
    const joined = deferred();
    const b = withUserResourceRequest("user", async () => {
      const result = shared("key", operation);
      joined.resolve();
      await result;
    });
    await joined.promise;
    release.resolve();
    expect((await Promise.all([a, b])).map((r) => r.status)).toEqual([
      429, 429,
    ]);
    expect(attempted).toBe(RESOURCE_LIMITS.providerAttempts);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["complete", "expire"] as const)(
    "keeps caller deadlines independent and lets the shared job %s on its own deadline",
    async (outcome) => {
      const shared = createUserScopedSharedWork<number>();
      const begin = deferred();
      const started = deferred();
      const release = deferred<number>();
      let signal!: AbortSignal;
      const operation = vi.fn(() => {
        signal = getResourceSignal()!;
        started.resolve();
        return release.promise;
      });
      // Request A starts 30 seconds before its job (deadline 60s vs job 90s).
      const a = withUserResourceRequest("user", async () => {
        await begin.promise;
        await shared("key", operation);
      });
      await vi.advanceTimersByTimeAsync(30_000);
      begin.resolve();
      await started.promise;
      await vi.advanceTimersByTimeAsync(15_000);
      const joined = deferred();
      const b = withUserResourceRequest("user", async () => {
        const result = shared("key", operation);
        joined.resolve();
        await result;
      });
      await joined.promise;
      await vi.advanceTimersByTimeAsync(15_000);
      const first = await a;
      expect(first.status).toBe(503);
      expect(first.headers.get("X-Cashfolio-Resource-Limit")).toBe(
        "read_deadline",
      );
      expect(signal.aborted).toBe(false);
      if (outcome === "complete") {
        release.resolve(2);
        expect((await b).status).toBe(200);
      } else {
        // B still has 15 seconds left, but joining did not extend the job.
        await vi.advanceTimersByTimeAsync(30_000);
        const second = await b;
        expect(second.status).toBe(503);
        expect(second.headers.get("X-Cashfolio-Resource-Limit")).toBe(
          "read_deadline",
        );
        expect(signal.aborted).toBe(true);
        release.resolve(2);
      }
      expect(operation).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    },
  );
});
