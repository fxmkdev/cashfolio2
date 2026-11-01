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
  undoAccountTreeMove: vi.fn(),
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
function render(api: OrganizerApi, onSaved = saved) {
  const useController = () => useOrganizer(onSaved, api);
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
  it("loads once, saves optimistically and exposes a single-use Undo", async () => {
    const api = createOrganizerStoryApi();
    const load = vi.spyOn(api, "load");
    let organizer = await ready(api);
    expect(organizer.blocked).toBe(false);
    const before = organizer.snapshot;
    const pending = organizer.saveMove(move);
    organizer = render(api);
    expect(organizer.pending).toBe(true);
    expect(
      organizer.snapshot?.nodes.find((node) => node.id === "checking")
        ?.parentId,
    ).toBe("destination");
    await pending;
    organizer = render(api);
    expect(organizer.undo).not.toBeNull();
    expect(organizer.message).toBe("Move saved.");
    await organizer.undoMove();
    organizer = render(api);
    expect(organizer.snapshot).toEqual(before);
    expect(organizer.undo).toBeNull();
    expect(organizer.message).toBe("Move undone.");
    expect(saved).toHaveBeenCalledTimes(2);
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
  it("does not call the server for a no-op or consume the existing Undo", async () => {
    const api = createOrganizerStoryApi();
    const submit = vi.spyOn(api, "move");
    await (await ready(api)).saveMove(move);
    const undo = render(api).undo;
    await render(api).saveMove(move);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(render(api).undo).toEqual(undo);
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
    expect(render(api).undo).not.toBeNull();
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
  it("clears Undo on conflicting refresh and disables stale busy retries", async () => {
    const api = createOrganizerStoryApi();
    await (await ready(api)).saveMove(move);
    const snapshot = await api.load();
    const load = vi
      .spyOn(api, "load")
      .mockResolvedValue({ ...snapshot, version: "concurrent" });
    await render(api).refresh();
    expect(render(api).undo).toBeNull();
    expect(render(api).retryDisabled).toBe(true);
    load.mockRestore();
  });
  it("keeps Undo available after a rolled-back Undo failure", async () => {
    const api = createOrganizerStoryApi();
    await (await ready(api)).saveMove(move);
    vi.spyOn(api, "undo").mockRejectedValueOnce(
      new Error(ACCOUNT_BOOK_BUSY_MESSAGE),
    );
    const previous = render(api).undo;
    await render(api).undoMove();
    expect(render(api).undo).toEqual(previous);
    render(api).retry();
    for (let i = 0; i < 12; i++) await Promise.resolve();
    expect(render(api).undo).toBeNull();
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
});
