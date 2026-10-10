import {
  useRef,
  type Dispatch,
  type KeyboardEvent,
  type MouseEvent,
  type SetStateAction,
} from "react";
import type {
  FirstDataRenderedEvent,
  GridApi,
  GridReadyEvent,
  IRowNode,
  RowDataUpdatedEvent,
  RowSelectedEvent,
  SelectionChangedEvent,
  SuppressKeyboardEventParams,
} from "ag-grid-enterprise";
import type { StatementImportDraft } from "./-statement-import";
import {
  isStatementImportReviewDraftRow,
  setStatementImportDraftSelection,
  type StatementImportGridRow,
} from "./-statement-import-page-controller";
import {
  getStatementImportInclusionRange,
  setStatementImportRangeInclusion,
} from "./-statement-import-inclusion";

type InclusionAnchor = { draftId: string; included: boolean };

export function useStatementImportInclusionState(args: {
  setDrafts: Dispatch<SetStateAction<StatementImportDraft[]>>;
  disabled: boolean;
}) {
  const apiRef = useRef<GridApi<StatementImportGridRow> | undefined>(undefined);
  const anchorRef = useRef<InclusionAnchor | undefined>(undefined);
  const interactionEventRef = useRef<Event | undefined>(undefined);

  function resetInclusionAnchor() {
    anchorRef.current = undefined;
    interactionEventRef.current = undefined;
  }

  function handleInclusionGridReady(
    event: GridReadyEvent<StatementImportGridRow>,
  ) {
    apiRef.current = event.api;
  }

  function handleInclusionRowSelected(
    event: RowSelectedEvent<StatementImportGridRow>,
  ) {
    if (
      args.disabled ||
      !isStatementImportReviewDraftRow(event.data) ||
      (event.source !== "checkboxSelected" && event.source !== "spaceKey")
    )
      return;
    // Ignore delayed native notifications after a newer click/select-all action.
    if (event.event && event.event !== interactionEventRef.current) return;
    anchorRef.current = {
      draftId: event.data.id,
      included: event.node.isSelected() === true,
    };
  }

  function applyRange(
    api: GridApi<StatementImportGridRow>,
    endpoint: IRowNode<StatementImportGridRow>,
  ) {
    if (!isStatementImportReviewDraftRow(endpoint.data)) return;
    const nodes: IRowNode<StatementImportGridRow>[] = [];
    api.forEachNodeAfterFilterAndSort((node) => {
      if (isStatementImportReviewDraftRow(node.data)) nodes.push(node);
    });
    const range = getStatementImportInclusionRange({
      displayedDraftIds: nodes.map((node) => node.id!),
      anchorDraftId: anchorRef.current?.draftId,
      endpointDraftId: endpoint.data.id,
    });
    const included =
      range.length > 0
        ? anchorRef.current!.included
        : endpoint.isSelected() !== true;
    const draftIds = range.length > 0 ? range : [endpoint.data.id];
    if (range.length === 0) {
      anchorRef.current = { draftId: endpoint.data.id, included };
    }
    args.setDrafts((drafts) =>
      setStatementImportRangeInclusion({ drafts, draftIds, included }),
    );
    // Keep the native checkboxes/header in sync even when the range is a no-op.
    const ids = new Set(draftIds);
    api.setNodesSelected({
      nodes: nodes.filter((node) => ids.has(node.id!)),
      newValue: included,
      source: "api",
    });
  }

  function handleInclusionClickCapture(event: MouseEvent<HTMLElement>) {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const header = target.closest(".ag-header-select-all");
    if (header) {
      if (args.disabled) {
        event.preventDefault();
        event.stopPropagation();
      } else resetInclusionAnchor();
      return;
    }
    if (!target.closest(".ag-selection-checkbox")) return;
    if (args.disabled) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const rowId = target.closest(".ag-row[row-id]")?.getAttribute("row-id");
    const api = apiRef.current;
    const node = rowId && api?.getRowNode(rowId);
    if (!api || !node) return;
    interactionEventRef.current = event.nativeEvent;
    if (!event.shiftKey) {
      if (isStatementImportReviewDraftRow(node.data)) {
        anchorRef.current = {
          draftId: node.data.id,
          included: node.isSelected() !== true,
        };
      }
      return;
    }
    // Native range selection can also alter rows outside this inclusion range.
    event.preventDefault();
    event.stopPropagation();
    // A cancelled native checkbox click restores its previous DOM checked value
    // after dispatch. Apply selection on the next frame so it cannot overwrite
    // AG Grid's updated checked value (especially on an already-matching endpoint).
    requestAnimationFrame(() => {
      if (apiRef.current === api && !api.isDestroyed()) applyRange(api, node);
    });
  }

  function suppressInclusionKeyboardEvent(
    params: SuppressKeyboardEventParams<StatementImportGridRow>,
  ) {
    if (params.editing || params.event.key !== " ") return false;
    if (args.disabled) return true;
    if (!params.event.shiftKey) return false;
    params.event.preventDefault();
    applyRange(params.api, params.node);
    return true;
  }

  function handleInclusionKeyDownCapture(event: KeyboardEvent<HTMLElement>) {
    const target = event.target;
    if (!(target instanceof Element)) return;
    // Leave text-selection shortcuts inside cell editors to the editor.
    if (
      target.closest(
        "input:not([type=checkbox]), textarea, [contenteditable=true]",
      )
    )
      return;
    const selectAll =
      (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a";
    const headerSpace =
      event.key === " " &&
      target.closest(".ag-header-cell")?.querySelector(".ag-header-select-all");
    if (event.key === " " && !headerSpace && !args.disabled) {
      const rowId = target.closest(".ag-row[row-id]")?.getAttribute("row-id");
      const node = rowId && apiRef.current?.getRowNode(rowId);
      if (node && isStatementImportReviewDraftRow(node.data)) {
        interactionEventRef.current = event.nativeEvent;
        if (!event.shiftKey)
          anchorRef.current = {
            draftId: node.data.id,
            included: node.isSelected() !== true,
          };
      }
    }
    if (!selectAll && !headerSpace) return;
    if (args.disabled) {
      event.preventDefault();
      event.stopPropagation();
    } else {
      // Select-all can be a no-op, in which case AG Grid emits no selection event.
      resetInclusionAnchor();
    }
  }

  function handleSelectionChange(
    event: SelectionChangedEvent<StatementImportGridRow>,
  ) {
    // Initialization and API synchronization must not change draft inclusion.
    if (
      event.source !== "checkboxSelected" &&
      event.source !== "spaceKey" &&
      event.source !== "keyboardSelectAll" &&
      event.source !== "uiSelectAll" &&
      event.source !== "uiSelectAllFiltered" &&
      event.source !== "uiSelectAllCurrentPage"
    )
      return;
    if (args.disabled) {
      syncDraftSelection(event.api);
      return;
    }
    const selectedDraftIds = event.api
      .getSelectedRows()
      .filter(isStatementImportReviewDraftRow)
      .map((draft) => draft.id);
    args.setDrafts((drafts) =>
      setStatementImportDraftSelection({ drafts, selectedDraftIds }),
    );
  }

  function syncDraftSelection(api: GridApi<StatementImportGridRow>) {
    const nodesToSelect: IRowNode<StatementImportGridRow>[] = [];
    const nodesToDeselect: IRowNode<StatementImportGridRow>[] = [];
    api.forEachNode((node) => {
      const selected =
        isStatementImportReviewDraftRow(node.data) && !node.data.ignored;
      if (node.isSelected() !== selected)
        (selected ? nodesToSelect : nodesToDeselect).push(node);
    });
    if (nodesToSelect.length > 0)
      api.setNodesSelected({
        nodes: nodesToSelect,
        newValue: true,
        source: "api",
      });
    if (nodesToDeselect.length > 0)
      api.setNodesSelected({
        nodes: nodesToDeselect,
        newValue: false,
        source: "api",
      });
  }

  function handleReviewRowsUpdated(
    event:
      | RowDataUpdatedEvent<StatementImportGridRow>
      | FirstDataRenderedEvent<StatementImportGridRow>,
  ) {
    syncDraftSelection(event.api);
  }

  return {
    handleInclusionGridReady,
    handleInclusionRowSelected,
    handleInclusionClickCapture,
    handleInclusionKeyDownCapture,
    suppressInclusionKeyboardEvent,
    handleSelectionChange,
    handleReviewRowsUpdated,
    resetInclusionAnchor,
  };
}
