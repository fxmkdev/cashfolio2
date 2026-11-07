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
import { createAssetClassStoryApi } from "./asset-class-story-fixtures";

function renderHook<T>(hook: () => T) {
  harness.cursor = 0;
  const result = hook();
  harness.effects.splice(0).forEach((effect) => effect());
  return result;
}
function render(
  api: OrganizerApi,
  onSaved = saved,
  autoLoad = true,
  metadata?: () => Promise<void>,
) {
  const useController = () => useOrganizer(onSaved, api, autoLoad, metadata);
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
    expect(render(api).focusFallbackIds).toEqual([]);
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
  it("offers sibling focus fallbacks instead of hidden descendants after archiving a root group", async () => {
    const api = createOrganizerStoryApi(
      undefined,
      organizeStoryNodes.map((node) => ({
        ...node,
        isActive: ["nested", "holding", "fund"].includes(node.id)
          ? false
          : node.isActive,
      })),
    );
    const organizer = await ready(api);
    expect(
      await organizer.submitState.runSubmit(() =>
        organizer.performLifecycle("archive", {
          id: "investments",
          nodeType: "accountGroup",
        }),
      ),
    ).toBe(true);
    expect(render(api).revealIds).toEqual(["investments"]);
    expect(render(api).focusFallbackIds[0]).toBe("destination");
    expect(render(api).focusFallbackIds).not.toContain("archived");
  });
});

describe("asset class lifecycle recovery", () => {
  it("passes replacement choice through one controller and never repeats a confirmed delete after refresh failure", async () => {
    const api = createAssetClassStoryApi();
    const organizer = await ready(api);
    const remove = vi.spyOn(api, "delete");
    const load = vi
      .spyOn(api, "load")
      .mockRejectedValue(new Error("Refresh failed"));
    const close = vi.fn();
    await organizer.submitState.runSubmit(() =>
      organizer.performLifecycle(
        "delete",
        { id: "swiss", nodeType: "assetClass" },
        close,
        "cash",
      ),
    );
    expect(remove).toHaveBeenCalledExactlyOnceWith(
      { id: "swiss", nodeType: "assetClass" },
      "cash",
    );
    expect(close).toHaveBeenCalledOnce();
    expect(
      render(api).snapshot?.nodes.some((node) => node.id === "swiss"),
    ).toBe(false);
    expect(render(api).blocked).toBe(true);
    render(api).retry();
    expect(remove).toHaveBeenCalledTimes(1);
    load.mockRestore();
    await render(api).submitState.refreshConstraints();
    expect(render(api).blocked).toBe(false);
    expect(
      render(api).snapshot?.nodes.find((node) => node.id === "cash"),
    ).toMatchObject({ activeCount: 2, archivedCount: 1 });
    expect(remove).toHaveBeenCalledTimes(1);
  });
});

describe("management editor submissions", () => {
  it("preserves category wording in shared editor and movement errors", async () => {
    const api = { ...createOrganizerStoryApi(), kind: "categories" as const };
    const organizer = await ready(api);
    const message = "An account with this name already exists in this group";
    await organizer.submitState.runSubmit(() =>
      organizer.performEdit(async () => {
        throw new Error(message);
      }),
    );
    expect(render(api).submitState.submissionError?.message).toBe(
      "A category with this name already exists in this category group",
    );
    expect(
      organizer.formatErrorMessage(
        "Active accounts and groups cannot belong to an archived group.",
      ),
    ).toBe(
      "Active categories and category groups cannot belong to an archived category group.",
    );
  });
  it("refreshes and reveals an edited item without resetting the hierarchy", async () => {
    const api = createAssetClassStoryApi();
    const organizer = await ready(api);
    const close = vi.fn();
    await organizer.submitState.runSubmit(() =>
      organizer.performEdit(
        () =>
          api.save({ id: "swiss", name: "Updated Class", parentId: "cash" }),
        { id: "swiss", nodeType: "assetClass" },
        close,
      ),
    );
    expect(close).toHaveBeenCalledOnce();
    expect(
      render(api).snapshot?.nodes.find((node) => node.id === "swiss"),
    ).toMatchObject({ name: "Updated Class", parentId: "cash" });
    expect(render(api).revealIds).toEqual(["swiss"]);
  });
  it("recovers a committed creation by reading metadata without repeating the save", async () => {
    const api = createAssetClassStoryApi();
    const organizer = await ready(api);
    const write = vi.fn(() =>
      api.save({ name: "New Class", parentId: "equities" }),
    );
    const close = vi.fn();
    const load = vi
      .spyOn(api, "load")
      .mockRejectedValue(new Error("Read unavailable"));
    await organizer.submitState.runSubmit(() =>
      organizer.performEdit(write, undefined, close),
    );
    expect(close).toHaveBeenCalledOnce();
    expect(write).toHaveBeenCalledOnce();
    expect(render(api).blocked).toBe(true);
    render(api).retry();
    expect(write).toHaveBeenCalledOnce();
    load.mockRestore();
    await render(api).submitState.refreshConstraints();
    const created = render(api).snapshot?.nodes.find(
      (node) => node.name === "New Class",
    );
    expect(created).toBeDefined();
    expect(render(api).revealIds).toContain(created?.id);
    expect(render(api).blocked).toBe(false);
    expect(write).toHaveBeenCalledOnce();
  });
  it("blocks editing until editor constraints recover after a committed move", async () => {
    const api = createAssetClassStoryApi();
    const metadata = vi.fn(async () => {});
    render(api, saved, true, metadata);
    for (let i = 0; i < 12; i++) await Promise.resolve();
    const organizer = render(api, saved, true, metadata);
    metadata.mockRejectedValue(new Error("Editor metadata unavailable"));
    await organizer.saveMove({
      items: [{ id: "swiss", nodeType: "assetClass" }],
      parentId: "cash",
      placement: "last",
    });
    expect(
      render(api, saved, true, metadata).snapshot?.nodes.find(
        (node) => node.id === "swiss",
      )?.parentId,
    ).toBe("cash");
    expect(render(api, saved, true, metadata).blocked).toBe(true);
    metadata.mockResolvedValue();
    await render(api, saved, true, metadata).submitState.refreshConstraints();
    expect(render(api, saved, true, metadata).blocked).toBe(false);
  });
});

describe("Account List bulk lifecycle", () => {
  const targets = [
    { id: "checking", nodeType: "account" as const },
    { id: "empty", nodeType: "accountGroup" as const },
  ];
  it.each(["archive", "delete"] as const)(
    "commits a mixed %s selection once and refreshes canonically",
    async (action) => {
      const api = createOrganizerStoryApi();
      const operation = vi.spyOn(
        api,
        action === "archive" ? "archiveMany" : "deleteMany",
      );
      const organizer = await ready(api);
      const close = vi.fn();
      await organizer.submitState.runSubmit(() =>
        organizer.performBulkLifecycle(action, targets, close),
      );
      expect(operation).toHaveBeenCalledExactlyOnceWith(targets);
      expect(close).toHaveBeenCalledOnce();
      expect(saved).toHaveBeenCalledOnce();
      expect(render(api).snapshot).toEqual(await api.load());
      expect(render(api).revealIds).toEqual(["checking", "empty"]);
    },
  );
  it("does not normalize selected children out of lifecycle validation", async () => {
    const api = createOrganizerStoryApi();
    const operation = vi.spyOn(api, "archiveMany");
    const organizer = await ready(api);
    await expect(
      organizer.performBulkLifecycle("archive", [
        { id: "investments", nodeType: "accountGroup" },
        { id: "nested", nodeType: "accountGroup" },
      ]),
    ).rejects.toThrow("Investments");
    expect(operation).not.toHaveBeenCalled();
  });
  it("blocks duplicate submissions and retries only a confirmed busy rollback", async () => {
    const api = createOrganizerStoryApi("busy");
    const operation = vi.spyOn(api, "archiveMany");
    const organizer = await ready(api);
    const pending = organizer.submitState.runSubmit(() =>
      organizer.performBulkLifecycle("archive", targets),
    );
    expect(
      await organizer.submitState.runSubmit(() =>
        organizer.performBulkLifecycle("archive", targets),
      ),
    ).toBe(false);
    await pending;
    expect(render(api).retryDisabled).toBe(false);
    render(api).retry();
    for (let i = 0; i < 24; i++) await Promise.resolve();
    expect(operation).toHaveBeenCalledTimes(2);
    expect(
      render(api).snapshot?.nodes.find((node) => node.id === "checking")
        ?.isActive,
    ).toBe(false);
  });
  it("disables a busy retry when booking eligibility changes without changing the version", async () => {
    const api = createOrganizerStoryApi("busy");
    const organizer = await ready(api);
    const before = organizer.snapshot!;
    const operation = vi.spyOn(api, "deleteMany");
    vi.spyOn(api, "load").mockResolvedValue({
      ...before,
      actionAvailability: {
        ...before.actionAvailability,
        checking: {
          ...before.actionAvailability.checking,
          deletable: false,
          deleteDisabledReason: "Has bookings",
        },
      },
    });
    await organizer.submitState.runSubmit(() =>
      organizer.performBulkLifecycle("delete", targets),
    );
    expect(render(api).retryDisabled).toBe(true);
    render(api).retry();
    expect(operation).toHaveBeenCalledOnce();
  });
  it("recovers a committed batch by reading without submitting it again", async () => {
    const api = createOrganizerStoryApi();
    const organizer = await ready(api);
    const operation = vi.spyOn(api, "archiveMany");
    const close = vi.fn();
    const load = vi.spyOn(api, "load").mockRejectedValue(new Error("Offline"));
    await organizer.submitState.runSubmit(() =>
      organizer.performBulkLifecycle("archive", targets, close),
    );
    expect(close).toHaveBeenCalledOnce();
    expect(render(api).blocked).toBe(true);
    expect(render(api).retryDisabled).toBe(true);
    render(api).retry();
    load.mockRestore();
    await render(api).submitState.refreshConstraints();
    expect(operation).toHaveBeenCalledOnce();
    expect(render(api).blocked).toBe(false);
    expect(
      render(api).snapshot?.nodes.find((node) => node.id === "empty")?.isActive,
    ).toBe(false);
  });
  it("requires refresh after an uncertain network outcome", async () => {
    const api = createOrganizerStoryApi("network");
    const organizer = await ready(api);
    const operation = vi.spyOn(api, "deleteMany");
    const load = vi
      .spyOn(api, "load")
      .mockRejectedValueOnce(new Error("Offline"));
    await organizer.submitState.runSubmit(() =>
      organizer.performBulkLifecycle("delete", targets),
    );
    expect(render(api).blocked).toBe(true);
    expect(render(api).submitState.submissionError?.isUncertainOutcome).toBe(
      true,
    );
    render(api).retry();
    expect(operation).toHaveBeenCalledOnce();
    await render(api).submitState.refreshConstraints();
    expect(render(api).blocked).toBe(false);
    load.mockRestore();
  });
});

describe("bulk Unarchive", () => {
  const targets = [
    { id: "checking", nodeType: "account" as const },
    { id: "empty", nodeType: "accountGroup" as const },
  ];
  const archivedNodes = () =>
    organizeStoryNodes.map((node) => ({
      ...node,
      isActive: targets.some((target) => target.id === node.id)
        ? false
        : node.isActive,
    }));

  it("unarchives accounts and groups once, refreshes, and announces the result", async () => {
    const api = createOrganizerStoryApi(undefined, archivedNodes());
    const operation = vi.spyOn(api, "unarchiveMany");
    const organizer = await ready(api);
    await organizer.submitState.runSubmit(() =>
      organizer.performBulkLifecycle("unarchive", targets),
    );
    expect(operation).toHaveBeenCalledExactlyOnceWith(targets);
    const next = render(api);
    expect(next.message).toBe("2 selected items unarchived.");
    expect(next.snapshot).toEqual(await api.load());
    expect(
      next.snapshot?.nodes
        .filter((node) => targets.some((target) => target.id === node.id))
        .every((node) => node.isActive),
    ).toBe(true);
    expect(next.revealIds).toEqual(["checking", "empty"]);
    expect(saved).toHaveBeenCalledOnce();
  });

  it("blocks duplicate unarchives and allows a confirmed busy rollback to retry", async () => {
    const api = createOrganizerStoryApi("busy", archivedNodes());
    const operation = vi.spyOn(api, "unarchiveMany");
    const organizer = await ready(api);
    const pending = organizer.submitState.runSubmit(() =>
      organizer.performBulkLifecycle("unarchive", targets),
    );
    expect(
      await organizer.submitState.runSubmit(() =>
        organizer.performBulkLifecycle("unarchive", targets),
      ),
    ).toBe(false);
    await pending;
    expect(render(api).retryDisabled).toBe(false);
    render(api).retry();
    for (let i = 0; i < 24; i++) await Promise.resolve();
    expect(operation).toHaveBeenCalledTimes(2);
    expect(render(api).message).toBe("2 selected items unarchived.");
  });

  it("disables retry when refreshed Unarchive eligibility changes", async () => {
    const api = createOrganizerStoryApi("busy", archivedNodes());
    const organizer = await ready(api);
    const before = organizer.snapshot!;
    const operation = vi.spyOn(api, "unarchiveMany");
    vi.spyOn(api, "load").mockResolvedValue({
      ...before,
      actionAvailability: {
        ...before.actionAvailability,
        checking: {
          ...before.actionAvailability.checking,
          unarchivable: false,
          unarchiveDisabledReason: "Archived ancestor",
        },
      },
    });
    await organizer.submitState.runSubmit(() =>
      organizer.performBulkLifecycle("unarchive", targets),
    );
    expect(render(api).retryDisabled).toBe(true);
    render(api).retry();
    expect(operation).toHaveBeenCalledOnce();
  });

  it("does not replay a committed bulk Unarchive after its refresh fails", async () => {
    const api = createOrganizerStoryApi(undefined, archivedNodes());
    const organizer = await ready(api);
    const operation = vi.spyOn(api, "unarchiveMany");
    const load = vi.spyOn(api, "load").mockRejectedValue(new Error("Offline"));
    await organizer.submitState.runSubmit(() =>
      organizer.performBulkLifecycle("unarchive", targets),
    );
    expect(
      render(api).snapshot?.nodes.find((node) => node.id === "checking")
        ?.isActive,
    ).toBe(true);
    expect(render(api).blocked).toBe(true);
    expect(render(api).retryDisabled).toBe(true);
    render(api).retry();
    load.mockRestore();
    await render(api).submitState.refreshConstraints();
    expect(operation).toHaveBeenCalledOnce();
    expect(render(api).blocked).toBe(false);
  });

  it("requires read recovery after an uncertain unarchive outcome", async () => {
    const api = createOrganizerStoryApi("network", archivedNodes());
    const organizer = await ready(api);
    const operation = vi.spyOn(api, "unarchiveMany");
    vi.spyOn(api, "load").mockRejectedValueOnce(new Error("Offline"));
    await organizer.submitState.runSubmit(() =>
      organizer.performBulkLifecycle("unarchive", targets),
    );
    expect(render(api).blocked).toBe(true);
    expect(render(api).submitState.submissionError?.isUncertainOutcome).toBe(
      true,
    );
    render(api).retry();
    expect(operation).toHaveBeenCalledOnce();
    await render(api).submitState.refreshConstraints();
    expect(render(api).blocked).toBe(false);
  });
});
