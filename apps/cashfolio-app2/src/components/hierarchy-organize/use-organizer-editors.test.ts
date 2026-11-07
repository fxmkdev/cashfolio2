import { describe, expect, it, vi } from "vitest";
vi.mock(
  "react",
  async () => (await import("./organizer-hook-harness")).reactHooksMock,
);
import {
  render,
  ready,
  saved,
  setupOrganizerTests,
} from "./organizer-test-support";
import { createOrganizerStoryApi } from "./story-fixtures";
import { createAssetClassStoryApi } from "./asset-class-story-fixtures";

setupOrganizerTests();

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
