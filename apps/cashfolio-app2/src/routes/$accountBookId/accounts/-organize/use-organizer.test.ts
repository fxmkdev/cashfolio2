import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OrganizerApi } from "./use-organizer";

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
  useCallback: (callback: unknown, deps: unknown[]) => {
    const index = harness.cursor++;
    const previous = harness.slots[index] as
      { callback: unknown; deps: unknown[] } | undefined;
    if (!previous || deps.some((dep, i) => dep !== previous.deps[i]))
      harness.slots[index] = { callback, deps };
    return (harness.slots[index] as { callback: unknown }).callback;
  },
  useEffect: (effect: () => (() => void) | void, deps: unknown[]) => {
    const index = harness.cursor++;
    const previous = harness.slots[index] as unknown[] | undefined;
    if (!previous || deps.some((dep, i) => dep !== previous[i])) {
      harness.slots[index] = deps;
      harness.effects.push(() => {
        harness.cleanups[index]?.();
        harness.cleanups[index] = effect() ?? (() => {});
      });
    }
  },
}));
vi.mock("@/server/accounts", () => ({
  getAccountOrganizeData: vi.fn(),
  moveAccountTreeItems: vi.fn(),
}));

import { useOrganizer } from "./use-organizer";
import { createOrganizerStoryApi, organizeStoryNodes } from "./story-fixtures";
import { ACCOUNT_BOOK_BUSY_MESSAGE } from "@/shared/mutation-errors";

function renderHook<T>(hook: () => T) {
  harness.cursor = 0;
  const result = hook();
  harness.effects.splice(0).forEach((effect) => effect());
  return result;
}
function render(api: OrganizerApi, onSaved = saved, autoLoad = true) {
  const useController = () => useOrganizer(onSaved, api, autoLoad);
  return renderHook(useController);
}
const saved = vi.fn();
async function ready(api: OrganizerApi) {
  render(api);
  for (let i = 0; i < 8; i++) await Promise.resolve();
  return render(api);
}
const move = {
  items: [organizeStoryNodes.find((node) => node.id === "checking")!],
  parentId: "destination",
  placement: "last" as const,
};
beforeEach(() => {
  harness.slots = [];
  harness.cursor = 0;
  harness.effects = [];
  harness.cleanups = [];
  vi.clearAllMocks();
  vi.useFakeTimers();
});
afterEach(() => {
  harness.cleanups.forEach((cleanup) => cleanup());
  vi.useRealTimers();
});

describe("organizer controller", () => {
  it("loads on explicit entry only, guards duplicate entry, and discards a cancelled session's response", async () => {
    const api = createOrganizerStoryApi();
    const original = api.load;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const load = vi.spyOn(api, "load").mockImplementationOnce(async () => {
      await gate;
      return original();
    });
    const organizer = render(api, saved, false);
    expect(load).not.toHaveBeenCalled();
    const pending = organizer.load();
    expect(await organizer.load()).toBe(false);
    expect(render(api, saved, false).loading).toBe(true);
    organizer.reset();
    release();
    expect(await pending).toBe(false);
    expect(render(api, saved, false).snapshot).toBeUndefined();
    expect(await render(api, saved, false).load()).toBe(true);
    expect(load).toHaveBeenCalledTimes(2);
    expect(render(api, saved, false).snapshot).toBeDefined();
  });
  it("does not activate an entry that finishes after unmount", async () => {
    const api = createOrganizerStoryApi();
    const organizer = render(api, saved, false);
    const pending = organizer.load();
    harness.cleanups.forEach((cleanup) => cleanup());
    expect(await pending).toBe(false);
    expect(render(api, saved, false).snapshot).toBeUndefined();
  });
  it("clears selection-reveal feedback and recovery errors before reentry", async () => {
    const api = createOrganizerStoryApi();
    await (await ready(api)).saveMove(move);
    vi.spyOn(api, "move").mockRejectedValueOnce(
      new TypeError("Failed to fetch"),
    );
    vi.spyOn(api, "load").mockRejectedValueOnce(new Error("Offline"));
    await render(api).saveMove({ ...move, parentId: null });
    expect(render(api).submitState.refreshError).toBeTruthy();
    render(api).reset();
    expect(render(api).revealIds).toEqual([]);
    expect(render(api).message).toBe("");
    expect(render(api).submitState.refreshError).toBeNull();
    expect(await render(api).load()).toBe(true);
    expect(render(api).blocked).toBe(false);
  });
  it("loads once and reconciles an optimistic move", async () => {
    const api = createOrganizerStoryApi();
    const load = vi.spyOn(api, "load");
    let organizer = await ready(api);
    expect(organizer.blocked).toBe(false);
    const pending = organizer.saveMove(move);
    organizer = render(api);
    expect(organizer.pending).toBe(true);
    expect(
      organizer.snapshot?.nodes.find((node) => node.id === "checking")
        ?.parentId,
    ).toBe("destination");
    await pending;
    organizer = render(api);
    expect(organizer.message).toBe("Move saved.");
    expect(
      organizer.snapshot?.nodes.find((node) => node.id === "checking")
        ?.parentId,
    ).toBe("destination");
    expect(saved).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledTimes(1);
  });
  it("ignores duplicate submissions and keeps Done/movement blocked until the request finishes", async () => {
    const api = createOrganizerStoryApi();
    const original = api.move;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const submit = vi.spyOn(api, "move").mockImplementation(async (...args) => {
      await gate;
      return original(...args);
    });
    const organizer = await ready(api);
    const pending = organizer.saveMove(move);
    expect(await organizer.saveMove(move)).toBe(false);
    expect(render(api).blocked).toBe(true);
    await vi.advanceTimersByTimeAsync(2000);
    expect(render(api).submitState.isWaiting).toBe(true);
    release();
    await pending;
    expect(submit).toHaveBeenCalledTimes(1);
    expect(render(api).pending).toBe(false);
  });
  it("does not call the server for a no-op", async () => {
    const api = createOrganizerStoryApi();
    const submit = vi.spyOn(api, "move");
    await (await ready(api)).saveMove(move);
    await render(api).saveMove(move);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(render(api).message).toContain("already in that position");
  });
  it("restores confirmed data, refreshes and allows a busy retry", async () => {
    const api = createOrganizerStoryApi("busy");
    const organizer = await ready(api);
    const before = organizer.snapshot;
    expect(await organizer.saveMove(move)).toBe(false);
    const failed = render(api);
    expect(failed.snapshot).toEqual(before);
    expect(failed.submitState.submissionError?.message).toBe(
      ACCOUNT_BOOK_BUSY_MESSAGE,
    );
    expect(failed.retryDisabled).toBe(false);
    failed.retry();
    for (let i = 0; i < 12; i++) await Promise.resolve();
    expect(render(api).message).toBe("Move saved.");
  });
  it("blocks movement after failed recovery and allows it only after a successful refresh", async () => {
    const api = createOrganizerStoryApi("network");
    const load = vi.spyOn(api, "load");
    await ready(api);
    load.mockRejectedValueOnce(new Error("Offline"));
    await render(api).saveMove(move);
    expect(render(api).blocked).toBe(true);
    expect(render(api).submitState.submissionError?.isUncertainOutcome).toBe(
      true,
    );
    expect(await render(api).saveMove(move)).toBe(false);
    await render(api).submitState.refreshConstraints();
    expect(render(api).blocked).toBe(false);
  });
  it("disables stale busy retries on conflicting refresh", async () => {
    const api = createOrganizerStoryApi();
    await (await ready(api)).saveMove(move);
    const snapshot = await api.load();
    const load = vi
      .spyOn(api, "load")
      .mockResolvedValue({ ...snapshot, version: "concurrent" });
    await render(api).refresh();
    expect(render(api).retryDisabled).toBe(true);
    load.mockRestore();
  });
  it("recovers from an initial load failure", async () => {
    const api = createOrganizerStoryApi("load");
    const organizer = await ready(api);
    expect(organizer.loadError).toContain("Could not load");
    expect(organizer.blocked).toBe(true);
    await organizer.refresh();
    expect(render(api).loadError).toBeUndefined();
    expect(render(api).blocked).toBe(false);
  });
  it("archives, unarchives and deletes with a canonical refresh after each commit", async () => {
    const api = createOrganizerStoryApi();
    const committed = vi.fn();
    await ready(api);
    for (const action of ["archive", "unarchive", "delete"] as const) {
      const organizer = render(api);
      expect(
        await organizer.submitState.runSubmit(() =>
          organizer.performLifecycle(action, move.items[0], committed),
        ),
      ).toBe(true);
      const next = render(api);
      expect(next.snapshot).toEqual(await api.load());
      const node = next.snapshot?.nodes.find((node) => node.id === "checking");
      if (action === "delete") expect(node).toBeUndefined();
      else expect(node?.isActive).toBe(action === "unarchive");
    }
    expect(saved).toHaveBeenCalledTimes(3);
    expect(committed).toHaveBeenCalledTimes(3);
  });
  it("keeps all mutations blocked until the post-commit refresh settles", async () => {
    const api = createOrganizerStoryApi();
    const organizer = await ready(api);
    const original = api.load;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(api, "load").mockImplementation(async () => {
      await gate;
      return original();
    });
    const archive = vi.spyOn(api, "archive");
    const pending = organizer.submitState.runSubmit(() =>
      organizer.performLifecycle("archive", move.items[0]),
    );
    for (let i = 0; i < 8; i++) await Promise.resolve();
    expect(render(api).pending).toBe(true);
    expect(await render(api).saveMove(move)).toBe(false);
    expect(
      await render(api).submitState.runSubmit(() =>
        render(api).performLifecycle("archive", move.items[0]),
      ),
    ).toBe(false);
    release();
    await pending;
    expect(archive).toHaveBeenCalledTimes(1);
    expect(render(api).pending).toBe(false);
  });
  it("never repeats a confirmed lifecycle commit when its refresh fails", async () => {
    const api = createOrganizerStoryApi();
    const organizer = await ready(api);
    const archive = vi.spyOn(api, "archive");
    const load = vi.spyOn(api, "load").mockRejectedValue(new Error("Offline"));
    const committed = vi.fn();
    expect(
      await organizer.submitState.runSubmit(() =>
        organizer.performLifecycle("archive", move.items[0], committed),
      ),
    ).toBe(false);
    expect(committed).toHaveBeenCalledTimes(1);
    expect(saved).toHaveBeenCalledTimes(1);
    expect(render(api).blocked).toBe(true);
    expect(render(api).retryDisabled).toBe(true);
    render(api).retry();
    load.mockRestore();
    await render(api).submitState.refreshConstraints();
    expect(archive).toHaveBeenCalledTimes(1);
    expect(
      render(api).snapshot?.nodes.find((node) => node.id === "checking")
        ?.isActive,
    ).toBe(false);
  });
  it("recovers from an uncertain lifecycle outcome before permitting another operation", async () => {
    const api = createOrganizerStoryApi("network");
    const organizer = await ready(api);
    const load = vi
      .spyOn(api, "load")
      .mockRejectedValueOnce(new Error("Offline"));
    await organizer.submitState.runSubmit(() =>
      organizer.performLifecycle("archive", move.items[0]),
    );
    expect(render(api).blocked).toBe(true);
    expect(render(api).submitState.submissionError?.isUncertainOutcome).toBe(
      true,
    );
    await expect(
      render(api).performLifecycle("delete", move.items[0]),
    ).rejects.toThrow("no longer available");
    await render(api).submitState.refreshConstraints();
    expect(render(api).blocked).toBe(false);
    load.mockRestore();
  });
  it("allows a confirmed busy rollback to retry and rejects ineligible lifecycle targets", async () => {
    const api = createOrganizerStoryApi("busy");
    const organizer = await ready(api);
    const archive = vi.spyOn(api, "archive");
    await organizer.submitState.runSubmit(() =>
      organizer.performLifecycle("archive", move.items[0]),
    );
    render(api).retry();
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(archive).toHaveBeenCalledTimes(2);
    expect(
      render(api).snapshot?.nodes.find((node) => node.id === "checking")
        ?.isActive,
    ).toBe(false);
    await expect(
      render(api).performLifecycle("archive", {
        id: "investments",
        nodeType: "accountGroup",
      }),
    ).rejects.toThrow("contains active");
    await expect(
      render(api).performLifecycle("delete", {
        id: "missing",
        nodeType: "account",
      }),
    ).rejects.toThrow("no longer available");
  });
  it("disables a busy retry when refreshed eligibility changes without a hierarchy edit", async () => {
    const api = createOrganizerStoryApi("busy");
    const organizer = await ready(api);
    const current = organizer.snapshot!;
    const archive = vi.spyOn(api, "archive");
    vi.spyOn(api, "load").mockResolvedValue({
      ...current,
      actionAvailability: {
        ...current.actionAvailability,
        checking: { ...current.actionAvailability.checking, archivable: false },
      },
    });
    await organizer.submitState.runSubmit(() =>
      organizer.performLifecycle("archive", move.items[0]),
    );
    expect(render(api).retryDisabled).toBe(true);
    render(api).retry();
    expect(archive).toHaveBeenCalledTimes(1);
  });
});
