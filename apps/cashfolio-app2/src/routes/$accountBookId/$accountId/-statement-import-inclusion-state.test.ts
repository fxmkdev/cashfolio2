import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { MouseEvent, KeyboardEvent } from "react";
import { AccountType } from "@/.prisma-client/enums";
import type {
  GridApi,
  GridReadyEvent,
  IRowNode,
  RowSelectedEvent,
  SelectionChangedEvent,
  RowDataUpdatedEvent,
  SuppressKeyboardEventParams,
} from "ag-grid-enterprise";
import { createStatementImportDraft } from "./-statement-import-draft-create";
import { createRow, currentAccount } from "./-statement-import-test-fixtures";
import {
  getStatementImportBalanceCarriedForwardRow,
  STATEMENT_IMPORT_BALANCE_CARRIED_FORWARD_ROW_ID,
  type StatementImportGridRow,
} from "./-statement-import-page-controller";

// Retain hook refs across renders while driving actual grid event contracts.
const harness = vi.hoisted(() => ({
  refs: [] as { current: unknown }[],
  cursor: 0,
}));
vi.mock("react", () => ({
  useRef: (initial: unknown) => {
    const index = harness.cursor++;
    return (harness.refs[index] ??= { current: initial });
  },
}));
import { useStatementImportInclusionState } from "./-statement-import-inclusion-state";

class TargetElement {
  constructor(
    readonly rowId?: string,
    readonly header = false,
    readonly editor = false,
    readonly rendererChild = false,
  ) {}
  matches(selector: string) {
    return (
      selector === ".ag-cell" &&
      !!this.rowId &&
      !this.header &&
      !this.editor &&
      !this.rendererChild
    );
  }
  closest(selector: string) {
    if (selector === ".ag-header-select-all") return this.header ? this : null;
    if (selector === ".ag-selection-checkbox") return this.rowId ? this : null;
    if (selector === ".ag-header-cell") return this.header ? this : null;
    if (selector === ".ag-row[row-id]") return this.rowId ? this : null;
    return this.editor ? this : null;
  }
  querySelector() {
    return this.header ? this : null;
  }
  getAttribute() {
    return this.rowId;
  }
}

function setup() {
  let drafts = ["a", "b", "c", "d"].map((id, index) => ({
    ...createStatementImportDraft({
      row: createRow(),
      currentAccount,
      sourceRowNumber: index + 2,
    }),
    id,
  }));
  let disabled = false;
  const selected = new Set(drafts.map((draft) => draft.id));
  const nodes = drafts.map((draft) => ({
    id: draft.id,
    data: draft,
    isSelected: () => selected.has(draft.id),
  }));
  const balance = getStatementImportBalanceCarriedForwardRow({
    persistedBalance: 100,
    account: { type: AccountType.ASSET },
  })!;
  const balanceNode = {
    id: balance.id,
    data: balance,
    isSelected: () => false,
  };
  let displayedNodes = [...nodes, balanceNode];
  const setDrafts = vi.fn((update) => {
    drafts = typeof update === "function" ? update(drafts) : update;
    nodes.forEach((node) => {
      node.data = drafts.find((draft) => draft.id === node.id)!;
    });
  });
  const setNodesSelected = vi.fn(({ nodes: changedNodes, newValue }) => {
    changedNodes.forEach((node: { id: string }) =>
      newValue ? selected.add(node.id) : selected.delete(node.id),
    );
  });
  const api = {
    isDestroyed: () => false,
    forEachNode: (callback: (node: unknown) => void) =>
      [...nodes, balanceNode].forEach(callback),
    forEachNodeAfterFilterAndSort: (callback: (node: unknown) => void) =>
      displayedNodes.forEach(callback),
    getRowNode: (id: string) =>
      [...nodes, balanceNode].find((node) => node.id === id),
    getSelectedRows: () =>
      nodes.filter((node) => selected.has(node.id)).map((node) => node.data),
    setNodesSelected,
  } as unknown as GridApi<StatementImportGridRow>;
  function useInclusionHarness() {
    harness.cursor = 0;
    return useStatementImportInclusionState({ setDrafts, disabled });
  }
  const render = useInclusionHarness;
  const state = render();
  state.handleInclusionGridReady({
    api,
  } as GridReadyEvent<StatementImportGridRow>);

  function selectionChange(source: SelectionChangedEvent["source"]) {
    render().handleSelectionChange({
      api,
      source,
    } as SelectionChangedEvent<StatementImportGridRow>);
  }
  function normal(
    id: string,
    source: "checkboxSelected" | "spaceKey" = "checkboxSelected",
  ) {
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    const node = nodes.find((node) => node.id === id)!;
    render().handleInclusionRowSelected({
      api,
      node,
      data: node.data,
      source,
    } as unknown as RowSelectedEvent<StatementImportGridRow>);
    selectionChange(source);
  }
  function click(id?: string, shiftKey = true, header = false) {
    const event = {
      target: new TargetElement(id, header),
      shiftKey,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };
    render().handleInclusionClickCapture(
      event as unknown as MouseEvent<HTMLElement>,
    );
    return event;
  }
  function key(id: string, shiftKey = true, key = " ", editing = false) {
    const event = { key, shiftKey, preventDefault: vi.fn() };
    const suppressed = render().suppressInclusionKeyboardEvent({
      api,
      node: api.getRowNode(id)!,
      event,
      editing,
    } as unknown as SuppressKeyboardEventParams<StatementImportGridRow>);
    return { suppressed, event };
  }
  function capturedKey(
    key = "a",
    header = false,
    editor = false,
    rendererChild = false,
  ) {
    const event = {
      target: new TargetElement("b", header, editor, rendererChild),
      key,
      ctrlKey: key === "a",
      metaKey: false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };
    render().handleInclusionKeyDownCapture(
      event as unknown as KeyboardEvent<HTMLElement>,
    );
    return event;
  }
  return {
    render,
    capturedKey,
    normal,
    click,
    key,
    selectionChange,
    api,
    setDrafts,
    setNodesSelected,
    getDrafts: () => drafts,
    included: () =>
      drafts.filter((draft) => !draft.ignored).map((draft) => draft.id),
    setDisabled: () => {
      disabled = true;
    },
    hide: (id: string) => {
      displayedNodes = displayedNodes.filter((node) => node.id !== id);
    },
  };
}

describe("statement import inclusion interactions", () => {
  beforeEach(() => {
    harness.refs = [];
    harness.cursor = 0;
    vi.stubGlobal("Element", TargetElement);
    vi.stubGlobal("requestAnimationFrame", (callback: () => void) => {
      callback();
      return 1;
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("ignores a mixed range even when its endpoint is already ignored, and preserves the anchor for shorter ranges", () => {
    const state = setup();
    state.normal("d");
    state.normal("b");
    const event = state.click("d");
    expect(state.included()).toEqual(["a"]);
    expect(event.stopPropagation).toHaveBeenCalled();
    state.click("c");
    expect(state.included()).toEqual(["a"]);
    expect(
      state.setNodesSelected.mock.lastCall?.[0].nodes.map(
        (node: IRowNode) => node.id,
      ),
    ).toEqual(["b", "c"]);
  });

  it("includes an upward range when the endpoint is already included", () => {
    const state = setup();
    state.normal("b");
    state.normal("c");
    state.normal("c");
    state.click("a");
    expect(state.included()).toEqual(["a", "b", "c", "d"]);
  });

  it("supports normal Space followed by Shift+Space", () => {
    const state = setup();
    state.normal("b", "spaceKey");
    state.key("d");
    expect(state.included()).toEqual(["a"]);
    expect(state.key("d").suppressed).toBe(true);
    expect(state.key("a", false).suppressed).toBe(false);
    expect(state.key("a", true, "Enter").suppressed).toBe(false);
    expect(state.key("a", true, " ", true).suppressed).toBe(false);
  });

  it("toggles only the endpoint without an anchor, and excludes non-draft rows", () => {
    const state = setup();
    state.click("c");
    expect(state.included()).toEqual(["a", "b", "d"]);
    state.setDrafts.mockClear();
    state.click(STATEMENT_IMPORT_BALANCE_CARRIED_FORWARD_ROW_ID);
    expect(state.setDrafts).not.toHaveBeenCalled();
  });

  it("retains the anchor through edited-row and API synchronization", () => {
    const state = setup();
    state.normal("b");
    state.setDrafts((drafts: ReturnType<typeof state.getDrafts>) =>
      drafts.map((draft) => ({ ...draft, description: "Edited" })),
    );
    state.render().handleReviewRowsUpdated({
      api: state.api,
    } as RowDataUpdatedEvent<StatementImportGridRow>);
    state.selectionChange("api");
    state.click("d");
    expect(state.included()).toEqual(["a"]);
    expect(
      state.getDrafts().every((draft) => draft.description === "Edited"),
    ).toBe(true);
  });

  it.each(["header", "select-all", "reset", "hidden"])(
    "clears or invalidates the anchor after %s",
    (action) => {
      const state = setup();
      state.normal("b");
      if (action === "header") state.click(undefined, false, true);
      if (action === "select-all") state.capturedKey();
      if (action === "reset") state.render().resetInclusionAnchor();
      if (action === "hidden") state.hide("b");
      state.click("d");
      expect(state.included()).toEqual(["a", "c"]);
    },
  );

  it("clears the anchor for keyboard select-all even when selection does not change", () => {
    const state = setup();
    state.normal("b");
    state.normal("b");
    expect(state.capturedKey().stopPropagation).not.toHaveBeenCalled();
    state.click("d");
    expect(state.included()).toEqual(["a", "b", "c"]);
  });

  it("does not recreate an anchor from a delayed native event after select-all", () => {
    const state = setup();
    const event = new Event("click");
    state.normal("b");
    state.normal("b");
    state.capturedKey();
    const node = state.api.getRowNode("b")!;
    state.render().handleInclusionRowSelected({
      api: state.api,
      node,
      data: node.data,
      source: "checkboxSelected",
      event,
    } as RowSelectedEvent<StatementImportGridRow>);
    state.click("d");
    expect(state.included()).toEqual(["a", "b", "c"]);
  });

  it("clears the anchor for header Space and leaves text editor shortcuts alone", () => {
    const state = setup();
    state.normal("b");
    state.capturedKey("a", false, true);
    state.capturedKey("ArrowDown");
    state.click("d");
    expect(state.included()).toEqual(["a"]);
    state.capturedKey(" ", true);
    state.click("c");
    expect(state.included()).toEqual(["a", "c"]);
  });

  it("does not establish an anchor for Space on a renderer child", () => {
    const state = setup();
    expect(
      state.capturedKey(" ", false, false, true).preventDefault,
    ).not.toHaveBeenCalled();
    state.click("d");
    expect(state.included()).toEqual(["a", "b", "c"]);
  });

  it("preserves an existing include anchor for Space on a renderer child", () => {
    const state = setup();
    state.normal("d");
    state.normal("a");
    state.normal("a");
    state.capturedKey(" ", false, false, true);
    state.click("d");
    expect(state.included()).toEqual(["a", "b", "c", "d"]);
  });

  it("blocks mouse/keyboard changes and restores native selection while submitting", () => {
    const state = setup();
    state.setDisabled();
    expect(state.click("b", false).stopPropagation).toHaveBeenCalled();
    expect(
      state.click(undefined, false, true).stopPropagation,
    ).toHaveBeenCalled();
    expect(state.key("b", false).suppressed).toBe(true);
    expect(state.capturedKey().stopPropagation).toHaveBeenCalled();
    expect(state.capturedKey(" ", true).stopPropagation).toHaveBeenCalled();
    state.normal("b");
    expect(state.included()).toEqual(["a", "b", "c", "d"]);
    expect(state.setDrafts).not.toHaveBeenCalled();
    expect(state.api.getRowNode("b")?.isSelected()).toBe(true);
  });

  it("lets ordinary checkbox clicks and unrelated clicks reach native handlers", () => {
    const state = setup();
    expect(state.click("b", false).stopPropagation).not.toHaveBeenCalled();
    expect(state.click().stopPropagation).not.toHaveBeenCalled();
  });
});
