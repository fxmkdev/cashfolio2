import { describe, expect, it, vi } from "vitest";
vi.mock(
  "react",
  async () => (await import("./organizer-test-hook-harness")).reactHooksMock,
);
import {
  render,
  ready,
  saved,
  setupOrganizerTests,
} from "./organizer-test-support";
import { createOrganizerStoryApi, organizeStoryNodes } from "./story-fixtures";

setupOrganizerTests();

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
    ).rejects.toThrow("Fund");
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
      nodes: before.nodes.map((node) =>
        node.nodeType === "account" && node.id === "checking"
          ? { ...node, isActive: true }
          : node,
      ),
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
