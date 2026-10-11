import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Retain hook state and refs across renders, including effect cleanup.
const harness = vi.hoisted(() => ({
  slots: [] as unknown[],
  cursor: 0,
  effects: [] as (() => void)[],
  cleanups: [] as (() => void)[],
}));
vi.mock("react", () => ({
  useState: (initial: unknown) => {
    const index = harness.cursor++;
    if (!(index in harness.slots))
      harness.slots[index] =
        typeof initial === "function" ? initial() : initial;
    return [
      harness.slots[index],
      (value: unknown) => {
        harness.slots[index] =
          typeof value === "function" ? value(harness.slots[index]) : value;
      },
    ];
  },
  useRef: (initial: unknown) => {
    const index = harness.cursor++;
    if (!(index in harness.slots)) harness.slots[index] = { current: initial };
    return harness.slots[index];
  },
  useCallback: (callback: unknown) => callback,
  useEffect: (effect: () => (() => void) | void, deps: unknown[]) => {
    const index = harness.cursor++;
    const previous = harness.slots[index] as unknown[] | undefined;
    if (!previous || deps.some((value, i) => value !== previous[i])) {
      harness.slots[index] = deps;
      harness.effects.push(() => {
        harness.cleanups[index]?.();
        harness.cleanups[index] = effect() ?? (() => {});
      });
    }
  },
}));
import { ACCOUNT_BOOK_BUSY_MESSAGE } from "../shared/mutation-errors";
import { useDialogSubmitState } from "./use-dialog-submit-state";
import { useRefreshedMutationData } from "./use-refreshed-mutation-data";

function render<T>(hook: () => T): T {
  harness.cursor = 0;
  const state = hook();
  harness.effects.splice(0).forEach((effect) => effect());
  return state;
}
function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
beforeEach(() => {
  harness.slots = [];
  harness.effects = [];
  harness.cleanups = [];
  vi.useFakeTimers();
});
afterEach(() => {
  harness.cleanups.forEach((cleanup) => cleanup());
  vi.useRealTimers();
});

describe("dialog submission lifecycle", () => {
  it("shows waiting after two seconds, prevents duplicates, and clears the timer on completion", async () => {
    const pending = deferred();
    const submit = vi.fn(() => pending.promise);
    const changed = vi.fn();
    const useHook = () => useDialogSubmitState({ onSubmittingChange: changed });
    const result = render(useHook).runSubmit(submit);
    expect(render(useHook).isSubmitting).toBe(true);
    await expect(render(useHook).runSubmit(submit)).resolves.toBe(false);
    expect(submit).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1999);
    expect(render(useHook).isWaiting).toBe(false);
    vi.advanceTimersByTime(1);
    expect(render(useHook).isWaiting).toBe(true);
    pending.resolve();
    await expect(result).resolves.toBe(true);
    expect(render(useHook)).toMatchObject({
      isSubmitting: false,
      isWaiting: false,
    });
    expect(vi.getTimerCount()).toBe(0);
    expect(changed.mock.calls).toEqual([[true], [false]]);
  });
  it("clears pending timers and parent state on unmount", async () => {
    const pending = deferred();
    const changed = vi.fn();
    const result = render(() =>
      useDialogSubmitState({ onSubmittingChange: changed }),
    ).runSubmit(() => pending.promise);
    harness.cleanups.forEach((cleanup) => cleanup());
    expect(vi.getTimerCount()).toBe(0);
    expect(changed).toHaveBeenLastCalledWith(false);
    pending.resolve();
    await result;
  });
  it("keeps existing error propagation unless capture is enabled", async () => {
    const error = new Error("rejected");
    const useHook = () => useDialogSubmitState();
    await expect(
      render(useHook).runSubmit(() => {
        throw error;
      }),
    ).rejects.toBe(error);
    expect(render(useHook)).toMatchObject({
      isSubmitting: false,
      submissionError: null,
    });
    expect(vi.getTimerCount()).toBe(0);
  });
  it("captures busy rollback, refreshes constraints, and only retries on explicit submission", async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const submit = vi
      .fn()
      .mockRejectedValueOnce(new Error(ACCOUNT_BOOK_BUSY_MESSAGE))
      .mockResolvedValue(undefined);
    const useHook = () =>
      useDialogSubmitState({
        captureErrors: true,
        onRefreshConstraints: refresh,
      });
    await expect(render(useHook).runSubmit(submit)).resolves.toBe(false);
    expect(render(useHook).submissionError).toMatchObject({
      isBusy: true,
      message: ACCOUNT_BOOK_BUSY_MESSAGE,
    });
    expect(refresh).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(10_000);
    expect(submit).toHaveBeenCalledOnce();
    await expect(render(useHook).runSubmit(submit)).resolves.toBe(true);
    expect(render(useHook).submissionError).toBeNull();
  });
  it("keeps refresh failure separate and prevents submitting during recovery", async () => {
    const pending = deferred();
    const refresh = vi.fn(() => pending.promise);
    const useHook = () =>
      useDialogSubmitState({
        captureErrors: true,
        onRefreshConstraints: refresh,
      });
    const result = render(useHook).runSubmit(() => {
      throw new Error("Date rejected");
    });
    expect(render(useHook)).toMatchObject({
      isRefreshing: true,
      submissionError: { message: "Date rejected" },
    });
    const duplicate = vi.fn();
    await expect(render(useHook).runSubmit(duplicate)).resolves.toBe(false);
    expect(duplicate).not.toHaveBeenCalled();
    pending.reject(new Error("offline"));
    await result;
    expect(render(useHook).submissionError?.message).toBe("Date rejected");
    expect(render(useHook).refreshError).toContain("Your draft is still here");
    refresh.mockResolvedValueOnce();
    await render(useHook).refreshConstraints();
    expect(render(useHook).refreshError).toBeNull();
    expect(render(useHook).submissionError?.message).toBe("Date rejected");
  });
});

describe("constraint refresh without replacing loader state", () => {
  it("refreshes choices while preserving drafts and ignores stale reads after navigation", async () => {
    const draft = { description: "Unsaved", accountId: "removed" };
    let source = { accounts: ["removed"], startDate: "2026-01-01" };
    let resolve!: (value: typeof source) => void;
    const load = vi.fn(
      () =>
        new Promise<typeof source>((yes) => {
          resolve = yes;
        }),
    );
    const useHook = () => {
      const [values] = useDraft(draft);
      return { ...useRefreshedMutationData(source, load), values };
    };
    const first = render(useHook).refresh();
    resolve({ accounts: ["new"], startDate: "2026-02-01" });
    await first;
    expect(render(useHook)).toMatchObject({
      data: { accounts: ["new"] },
      values: draft,
    });
    expect(render(useHook).values).toBe(draft);
    const old = render(useHook).refresh();
    source = { accounts: ["navigated"], startDate: "2026-03-01" };
    render(useHook);
    resolve({ accounts: ["stale"], startDate: "2026-01-01" });
    await old;
    expect(render(useHook).data).toBe(source);
  });
});
import { useState as useDraft } from "react";
