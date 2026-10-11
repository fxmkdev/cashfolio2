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
import {
  useReorderGroupChildren,
  type ReorderGroupChildRow,
} from "./use-reorder-group-children";
import { useUnarchiveMutation } from "./use-unarchive-mutation";

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

describe("reorder recovery", () => {
  const initialRows: ReorderGroupChildRow[] = [
    { id: "a", name: "A", nodeType: "account" },
    { id: "b", name: "B", nodeType: "accountGroup" },
  ];
  const reversed = [...initialRows].reverse();
  it("restores the confirmed order and remounts the grid before refreshing", async () => {
    const onReorder = vi.fn().mockRejectedValue(new Error("Rejected reorder"));
    let refreshed = initialRows;
    const refresh = vi.fn(async () => {
      expect(render(useHook).rows).toEqual(initialRows);
      expect(render(useHook).gridVersion).toBe(1);
      refreshed = [...initialRows];
    });
    const useHook = () =>
      useReorderGroupChildren({
        opened: true,
        initialRows: refreshed,
        onReorder,
        onRefreshConstraints: refresh,
      });
    await render(useHook).reorder(reversed);
    expect(render(useHook).submitState.submissionError?.message).toBe(
      "Rejected reorder",
    );
    expect(refresh).toHaveBeenCalledOnce();
    await render(useHook).reorder(reversed);
    expect(onReorder).toHaveBeenCalledTimes(2);
  });
  it("retains a successful order and prevents duplicate pending drags", async () => {
    const pending = deferred();
    const onReorder = vi.fn(() => pending.promise);
    const useHook = () =>
      useReorderGroupChildren({ opened: true, initialRows, onReorder });
    const result = render(useHook).reorder(reversed);
    await render(useHook).reorder(initialRows);
    expect(onReorder).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(2000);
    expect(render(useHook).submitState.isWaiting).toBe(true);
    pending.resolve();
    await result;
    expect(render(useHook).rows).toEqual(reversed);
    expect(render(useHook).submitState.isWaiting).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("offers explicit busy retry without automatically resubmitting", async () => {
    const onReorder = vi
      .fn()
      .mockRejectedValueOnce(new Error(ACCOUNT_BOOK_BUSY_MESSAGE))
      .mockResolvedValue(undefined);
    const useHook = () =>
      useReorderGroupChildren({ opened: true, initialRows, onReorder });
    await render(useHook).reorder(reversed);
    expect(onReorder).toHaveBeenCalledOnce();
    expect(render(useHook).rows).toEqual(initialRows);
    await render(useHook).retry();
    expect(onReorder).toHaveBeenLastCalledWith(reversed);
    expect(onReorder).toHaveBeenCalledTimes(2);
    expect(render(useHook).rows).toEqual(reversed);
  });
  it("requires a new drag when refreshed sibling membership changed", async () => {
    let refreshed = initialRows;
    const onReorder = vi
      .fn()
      .mockRejectedValue(new Error(ACCOUNT_BOOK_BUSY_MESSAGE));
    const refresh = async () => {
      refreshed = [initialRows[0], { id: "c", name: "C", nodeType: "account" }];
    };
    const useHook = () =>
      useReorderGroupChildren({
        opened: true,
        initialRows: refreshed,
        onReorder,
        onRefreshConstraints: refresh,
      });
    await render(useHook).reorder(reversed);
    expect(render(useHook).membershipChanged).toBe(true);
    await render(useHook).retry();
    expect(onReorder).toHaveBeenCalledOnce();
    expect(render(useHook).rows).toEqual(refreshed);
  });
  it("keeps a failed refresh separate and allows manual recovery", async () => {
    const onReorder = vi
      .fn()
      .mockRejectedValue(new Error("Validation rejected"));
    const refresh = vi
      .fn()
      .mockRejectedValueOnce(new Error("Read failed"))
      .mockResolvedValue(undefined);
    const useHook = () =>
      useReorderGroupChildren({
        opened: true,
        initialRows,
        onReorder,
        onRefreshConstraints: refresh,
      });
    await render(useHook).reorder(reversed);
    expect(render(useHook).submitState.refreshError).toContain(
      "Could not refresh",
    );
    await render(useHook).submitState.refreshConstraints();
    expect(render(useHook).submitState.refreshError).toBeNull();
    expect(render(useHook).submitState.submissionError?.message).toBe(
      "Validation rejected",
    );
    await render(useHook).retry();
    expect(onReorder).toHaveBeenCalledOnce();
  });
  it("does not retry uncertain outcomes or unchanged/invalid row orders", async () => {
    const onReorder = vi
      .fn()
      .mockRejectedValue(new TypeError("Failed to fetch"));
    const useHook = () =>
      useReorderGroupChildren({ opened: true, initialRows, onReorder });
    await render(useHook).reorder(initialRows);
    await render(useHook).reorder([initialRows[0]]);
    expect(onReorder).not.toHaveBeenCalled();
    await render(useHook).reorder(reversed);
    expect(
      render(useHook).submitState.submissionError?.isUncertainOutcome,
    ).toBe(true);
    await render(useHook).retry();
    expect(onReorder).toHaveBeenCalledOnce();
  });
});

describe("direct unarchive recovery", () => {
  const account = { id: "a", name: "Account", nodeType: "account" as const };
  const group = { id: "g", name: "Group", nodeType: "accountGroup" as const };
  it.each([account, group])(
    "captures rejection and refreshes the target's eligibility: $nodeType",
    async (target) => {
      let eligible = true;
      const onUnarchive = vi
        .fn()
        .mockRejectedValue(new Error("Inactive ancestor"));
      const refresh = vi.fn(async () => {
        eligible = false;
      });
      const useHook = () =>
        useUnarchiveMutation({
          scopeKey: "book",
          onUnarchive,
          onRefreshConstraints: refresh,
          isEligible: () => eligible,
        });
      await render(useHook).unarchive(target);
      expect(render(useHook).target).toEqual(target);
      expect(render(useHook).submitState.submissionError?.message).toBe(
        "Inactive ancestor",
      );
      expect(render(useHook).retryDisabled).toBe(true);
      expect(refresh).toHaveBeenCalledOnce();
      await render(useHook).retry();
      expect(onUnarchive).toHaveBeenCalledOnce();
    },
  );
  it("does not replace the pending target on duplicate submission", async () => {
    const pending = deferred();
    const onUnarchive = vi.fn(() => pending.promise);
    const useHook = () =>
      useUnarchiveMutation({
        scopeKey: "book",
        onUnarchive,
        onRefreshConstraints: vi.fn(),
        isEligible: () => true,
      });
    const result = render(useHook).unarchive(account);
    await render(useHook).unarchive(group);
    expect(render(useHook).target).toEqual(account);
    expect(render(useHook).isPending).toBe(true);
    expect(onUnarchive).toHaveBeenCalledOnce();
    pending.resolve();
    await result;
    expect(render(useHook).target).toBeNull();
  });
  it("only explicitly retries confirmed busy rollback while still eligible", async () => {
    let eligible = true;
    const onUnarchive = vi
      .fn()
      .mockRejectedValueOnce(new Error(ACCOUNT_BOOK_BUSY_MESSAGE))
      .mockResolvedValue(undefined);
    const useHook = () =>
      useUnarchiveMutation({
        scopeKey: "book",
        onUnarchive,
        onRefreshConstraints: vi.fn(),
        isEligible: () => eligible,
      });
    await render(useHook).unarchive(account);
    expect(onUnarchive).toHaveBeenCalledOnce();
    eligible = false;
    await render(useHook).retry();
    expect(onUnarchive).toHaveBeenCalledOnce();
    eligible = true;
    await render(useHook).retry();
    expect(onUnarchive).toHaveBeenCalledTimes(2);
    expect(render(useHook).target).toBeNull();
  });
  it("keeps network uncertainty and refresh errors separate, and clears context on navigation", async () => {
    let scopeKey = "book:a";
    const onUnarchive = vi
      .fn()
      .mockRejectedValue(new TypeError("Failed to fetch"));
    const refresh = vi.fn().mockRejectedValue(new Error("Read failed"));
    const useHook = () =>
      useUnarchiveMutation({
        scopeKey,
        onUnarchive,
        onRefreshConstraints: refresh,
        isEligible: () => true,
      });
    await render(useHook).unarchive(account);
    expect(
      render(useHook).submitState.submissionError?.isUncertainOutcome,
    ).toBe(true);
    expect(render(useHook).submitState.refreshError).toContain(
      "Could not refresh",
    );
    await render(useHook).retry();
    expect(onUnarchive).toHaveBeenCalledOnce();
    scopeKey = "book:b";
    render(useHook);
    expect(render(useHook).target).toBeNull();
  });
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
