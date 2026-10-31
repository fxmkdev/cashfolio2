import { getEventListeners } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  bindResourceUser,
  createUserScopedSharedWork,
  getResourceSignal,
  startReadBudget,
  withResourceRequest,
} from "./resource-context.server";
import { deferred } from "./test-support/deferred";
import { withUserResourceRequest } from "./test-support/resource-request";
import { RESOURCE_LIMITS } from "../shared/resource-limits";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("per-user shared work lifecycle", () => {
  it.each([
    ["unbound", "cancel"],
    ["unbound", "deadline"],
    ["authenticated", "cancel"],
    ["authenticated", "deadline"],
  ] as const)(
    "does not start queued %s work after request %s",
    async (identity, failure) => {
      const shared = createUserScopedSharedWork<number>();
      const operation = vi.fn(async () => 1);
      const controller = new AbortController();
      const response = await withResourceRequest(
        controller.signal,
        async () => {
          if (identity === "authenticated") bindResourceUser("user");
          startReadBudget();
          const work = shared("key", operation);
          if (failure === "cancel") controller.abort();
          else vi.setSystemTime(Date.now() + RESOURCE_LIMITS.readMs);
          await work;
          return new Response();
        },
      );
      expect(response.status).toBe(503);
      expect(response.headers.get("X-Cashfolio-Resource-Limit")).toBe(
        failure === "cancel" ? "cancelled" : "read_deadline",
      );
      expect(operation).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it.each([0, 1])(
    "keeps work alive when subscriber %s cancels",
    async (failed) => {
      const shared = createUserScopedSharedWork<number>();
      const ready = deferred();
      const release = deferred<number>();
      let signal!: AbortSignal;
      const operation = vi.fn(async () => {
        signal = getResourceSignal()!;
        ready.resolve();
        return release.promise;
      });
      const controllers = [new AbortController(), new AbortController()];
      const joined = deferred();
      const first = withUserResourceRequest(
        "user",
        async () => {
          expect(await shared("key", operation)).toBe(7);
        },
        controllers[0]!.signal,
      );
      await ready.promise;
      const second = withUserResourceRequest(
        "user",
        async () => {
          const work = shared("key", operation);
          joined.resolve();
          expect(await work).toBe(7);
        },
        controllers[1]!.signal,
      );
      await joined.promise;
      controllers[failed]!.abort();
      const requests = [first, second];
      expect((await requests[failed]!).status).toBe(503);
      expect(signal.aborted).toBe(false);
      release.resolve(7);
      expect((await requests[1 - failed]!).status).toBe(200);
      expect(operation).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
      expect(getEventListeners(signal, "abort")).toHaveLength(0);
      for (const controller of controllers)
        expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
    },
  );

  it("separates users while sharing overlapping work within one user", async () => {
    const shared = createUserScopedSharedWork<number>();
    const release = deferred<number>();
    const operation = vi.fn(() => release.promise);
    const requests = ["one", "one", "two"].map((user) =>
      withUserResourceRequest(user, async () => {
        expect(await shared("same-key", operation)).toBe(3);
      }),
    );
    await vi.waitFor(() => expect(operation).toHaveBeenCalledTimes(2));
    release.resolve(3);
    expect((await Promise.all(requests)).map((r) => r.status)).toEqual([
      200, 200, 200,
    ]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps background and unbound requests separate from authenticated jobs", async () => {
    const shared = createUserScopedSharedWork<number>();
    const release = deferred<number>();
    const operation = vi.fn(() => release.promise);
    const background = [shared("key", operation), shared("key", operation)];
    const authenticated = withUserResourceRequest("user", async () => {
      await shared("key", operation);
    });
    const unbound = [0, 1].map(() =>
      withResourceRequest(new AbortController().signal, async () => {
        await Promise.all([shared("key", operation), shared("key", operation)]);
        return new Response();
      }),
    );
    await vi.waitFor(() => expect(operation).toHaveBeenCalledTimes(4));
    release.resolve(1);
    expect(await Promise.all(background)).toEqual([1, 1]);
    expect((await authenticated).status).toBe(200);
    expect((await Promise.all(unbound)).map((r) => r.status)).toEqual([
      200, 200,
    ]);
  });

  it("abandons work with no subscribers without letting its late cleanup remove a replacement", async () => {
    const shared = createUserScopedSharedWork<number>();
    const gates = [deferred<number>(), deferred<number>()];
    const signals: AbortSignal[] = [];
    const operation = vi.fn(() => {
      signals.push(getResourceSignal()!);
      return gates[signals.length - 1]!.promise;
    });
    const controller = new AbortController();
    const first = withUserResourceRequest(
      "user",
      async () => {
        await shared("key", operation);
      },
      controller.signal,
    );
    await vi.waitFor(() => expect(operation).toHaveBeenCalledOnce());
    controller.abort();
    expect((await first).status).toBe(503);
    expect(signals[0]!.aborted).toBe(true);
    const second = withUserResourceRequest("user", async () => {
      expect(await shared("key", operation)).toBe(8);
    });
    await vi.waitFor(() => expect(operation).toHaveBeenCalledTimes(2));
    gates[0]!.reject(new Error("late producer failure"));
    const joined = deferred();
    const third = withUserResourceRequest("user", async () => {
      const result = shared("key", operation);
      joined.resolve();
      expect(await result).toBe(8);
    });
    await joined.promise;
    gates[1]!.resolve(8);
    expect((await Promise.all([second, third])).map((r) => r.status)).toEqual([
      200, 200,
    ]);
    expect(operation).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("evicts failed work and permits retries without leaking timers", async () => {
    const shared = createUserScopedSharedWork<number>();
    const operation = vi
      .fn<() => Promise<number>>()
      .mockRejectedValueOnce(new Error("failed"))
      .mockResolvedValue(4);
    const load = () =>
      withUserResourceRequest("user", async () => {
        expect(await shared("key", operation)).toBe(4);
      });
    await expect(load()).rejects.toThrow("failed");
    expect((await load()).status).toBe(200);
    expect(operation).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects recursive subscription to the same job", async () => {
    const shared = createUserScopedSharedWork<number>();
    await expect(
      withUserResourceRequest("user", async () => {
        await shared("key", () => shared("key", async () => 1));
      }),
    ).rejects.toThrow("cannot subscribe to itself");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not permit a resource context to switch verified users", async () => {
    expect(
      (
        await withUserResourceRequest("one", async () => {
          bindResourceUser("one");
          expect(() => bindResourceUser("two")).toThrow("cannot change");
        })
      ).status,
    ).toBe(200);
  });
});
