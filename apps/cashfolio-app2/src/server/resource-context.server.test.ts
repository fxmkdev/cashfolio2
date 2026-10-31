import { afterEach, describe, expect, it, vi } from "vitest";
import { RESOURCE_LIMITS } from "../shared/resource-limits";
import { ResourceLimitError } from "./resource-error";
import { deferred } from "./test-support/deferred";
import {
  startReadBudget,
  checkResourceBudget,
  consumeProviderAttempt,
  createRequestScopedInFlightMap,
  getResourceSignal,
  reuseResourceRequestWork,
  withResourceRequest,
} from "./resource-context.server";

afterEach(() => vi.useRealTimers());
const run = (operation: () => Promise<Response>) =>
  withResourceRequest(new AbortController().signal, operation);

describe("request-local resource budgets", () => {
  it("isolates in-flight maps by request and from background work", async () => {
    const getEntries = createRequestScopedInFlightMap<number>();
    const background = getEntries();
    background.set("same-key", Promise.resolve(1));
    const ready = deferred();
    const release = deferred();
    let firstEntries!: Map<string, Promise<number>>;
    const first = run(async () => {
      firstEntries = getEntries();
      firstEntries.set("same-key", Promise.resolve(2));
      ready.resolve();
      await release.promise;
      expect(getEntries()).toBe(firstEntries);
      expect(await getEntries().get("same-key")).toBe(2);
      return new Response();
    });
    await ready.promise;
    try {
      await run(async () => {
        const entries = getEntries();
        expect(entries).not.toBe(firstEntries);
        expect(entries).not.toBe(background);
        expect(entries.has("same-key")).toBe(false);
        entries.set("same-key", Promise.resolve(3));
        expect(getEntries()).toBe(entries);
        return new Response();
      });
      expect(getEntries()).toBe(background);
      expect(await background.get("same-key")).toBe(1);
    } finally {
      release.resolve();
      await first;
    }
    await run(async () => {
      expect(getEntries().has("same-key")).toBe(false);
      return new Response();
    });
  });

  it("does not expose an in-flight map after request cancellation", async () => {
    const getEntries = createRequestScopedInFlightMap<number>();
    const controller = new AbortController();
    const response = await withResourceRequest(controller.signal, async () => {
      getEntries();
      controller.abort();
      expect(getEntries).toThrow("request was cancelled");
      return new Response();
    });
    expect(response.status).toBe(503);
  });

  it.each(["operation error", "stream error", "completion"] as const)(
    "closes delayed siblings after %s and preserves the original failure",
    async (outcome) => {
      const original = new Error("original request error");
      let resume!: () => void;
      const gate = new Promise<void>((resolve) => {
        resume = resolve;
      });
      const memoWork = vi.fn().mockResolvedValue(1);
      let sibling!: Promise<PromiseSettledResult<unknown>[]>;
      let signal!: AbortSignal;
      const response = run(async () => {
        startReadBudget();
        signal = getResourceSignal()!;
        sibling = (async () => {
          await gate;
          return Promise.allSettled([
            Promise.resolve().then(checkResourceBudget),
            Promise.resolve().then(consumeProviderAttempt),
            Promise.resolve().then(startReadBudget),
            Promise.resolve().then(() =>
              reuseResourceRequestWork("late", memoWork),
            ),
          ]);
        })();
        if (outcome === "operation error")
          await Promise.all([Promise.reject(original), sibling]);
        return outcome === "stream error"
          ? new Response(
              new ReadableStream({
                pull() {
                  throw original;
                },
              }),
            )
          : new Response("complete");
      });
      if (outcome === "operation error")
        await expect(response).rejects.toBe(original);
      else if (outcome === "stream error")
        await expect((await response).text()).rejects.toBe(original);
      else expect(await (await response).text()).toBe("complete");
      expect(signal.aborted).toBe(true);
      resume();
      for (const result of await sibling) {
        expect(result.status).toBe("rejected");
        if (outcome !== "completion" && result.status === "rejected")
          expect(result.reason).toBe(original);
      }
      expect(memoWork).not.toHaveBeenCalled();
    },
  );

  it("closes cancellation idempotently even if an abort handler reenters budget checks", async () => {
    let signal!: AbortSignal;
    let reentry: unknown;
    const response = await run(async () => {
      startReadBudget();
      signal = getResourceSignal()!;
      signal.addEventListener("abort", () => {
        try {
          consumeProviderAttempt();
        } catch (error) {
          reentry = error;
        }
      });
      return new Response(new ReadableStream());
    });
    await response.body!.cancel();
    expect(signal.aborted).toBe(true);
    expect(reentry).toBe(signal.reason);
  });

  it("does not start work when already cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    const operation = vi.fn();
    const response = await withResourceRequest(controller.signal, operation);
    expect(operation).not.toHaveBeenCalled();
    expect(response.status).toBe(503);
    expect(response.headers.get("X-Cashfolio-Resource-Limit")).toBe(
      "cancelled",
    );
  });

  it("aborts immediately on disconnect without racing the enclosing operation", async () => {
    const controller = new AbortController();
    let settle!: () => void;
    const work = new Promise<void>((resolve) => {
      settle = resolve;
    });
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    let signal!: AbortSignal;
    const result = withResourceRequest(controller.signal, async () => {
      startReadBudget();
      signal = getResourceSignal()!;
      started();
      await work;
      return new Response();
    });
    await ready;
    controller.abort();
    expect(signal.aborted).toBe(true);
    settle();
    expect((await result).status).toBe(503);
  });

  it("shares settled memoized probes and evicts rejected entries", async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error("provider failed"))
      .mockResolvedValue(1);
    await run(async () => {
      await expect(
        reuseResourceRequestWork("probe", operation),
      ).rejects.toThrow("provider failed");
      expect(await reuseResourceRequestWork("probe", operation)).toBe(1);
      expect(await reuseResourceRequestWork("probe", operation)).toBe(1);
      return new Response();
    });
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("allows exactly 250 attempts and resets between incoming requests", async () => {
    for (let request = 0; request < 2; request++) {
      const response = await run(async () => {
        for (let i = 0; i < RESOURCE_LIMITS.providerAttempts; i++)
          consumeProviderAttempt();
        return new Response();
      });
      expect(response.status).toBe(200);
    }
  });

  it("returns the budget error even if a fallback swallows it", async () => {
    const response = await run(async () => {
      startReadBudget();
      try {
        for (let i = 0; i <= RESOURCE_LIMITS.providerAttempts; i++)
          consumeProviderAttempt();
      } catch {
        /* legacy fallback */
      }
      return new Response("partial financial results");
    });
    expect(response.status).toBe(429);
    expect(await response.text()).toContain("narrower range");
    expect(response.headers.get("Retry-After")).toBe("1");
    expect(response.headers.get("X-Cashfolio-Resource-Limit")).toBe(
      "provider_request_limit",
    );
  });

  it("starts the read deadline once and does not extend it for internal calls", async () => {
    vi.useFakeTimers();
    const response = await run(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
      startReadBudget();
      await vi.advanceTimersByTimeAsync(30_000);
      startReadBudget();
      await vi.advanceTimersByTimeAsync(30_000);
      checkResourceBudget();
      return new Response();
    });
    expect(response.status).toBe(503);
    expect(response.headers.get("X-Cashfolio-Resource-Limit")).toBe(
      "read_deadline",
    );
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not start a read deadline for lightweight requests", async () => {
    vi.useFakeTimers();
    const response = await run(async () => {
      await vi.advanceTimersByTimeAsync(90_000);
      checkResourceBudget();
      return new Response();
    });
    expect(response.status).toBe(200);
  });

  it("clears the deadline on successful completion", async () => {
    vi.useFakeTimers();
    await run(async () => {
      startReadBudget();
      return new Response();
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("preserves structured resource responses", async () => {
    const response = await run(async () => {
      throw new ResourceLimitError(
        "Book changed",
        409,
        0,
        "history_revision_changed",
      );
    });
    expect(response.status).toBe(409);
    expect(response.headers.get("X-Cashfolio-Resource-Limit")).toBe(
      "history_revision_changed",
    );
    expect(await response.text()).toBe("Book changed");
  });
});
