import type {
  CellValueChangedEvent,
  FirstDataRenderedEvent,
  GridApi,
  IRowNode,
  RowDataUpdatedEvent,
  SelectionChangedEvent,
} from "ag-grid-enterprise";
import type { Dispatch, SetStateAction } from "react";
import type { AccountOption } from "@/components/edit-transaction-modal";
import type { LedgerAccount } from "./-page-types";
import {
  hasStatementImportSingleCounterBooking,
  updateStatementImportDraftCounterAccount,
  updateStatementImportDraftDescription,
  type StatementImportDraft,
} from "./-statement-import";
import { useStatementImportColumnDefs } from "./-statement-import-page-columns";
import {
  isStatementImportReviewDraftRow,
  setStatementImportDraftSelection,
  type StatementImportGridRow,
} from "./-statement-import-page-controller";
import { useStatementImportReviewDerivedState } from "./-statement-import-page-review-derived-state";

export function useStatementImportReviewState(args: {
  account: LedgerAccount;
  accountBookStartDate: Date;
  accountOptions: AccountOption[];
  persistedBalance: number;
  drafts: StatementImportDraft[];
  setDrafts: Dispatch<SetStateAction<StatementImportDraft[]>>;
  isSubmitting: boolean;
  isEditSubmitting: boolean;
  onEditDraft: (draftId: string) => void;
}) {
  const {
    account,
    accountBookStartDate,
    accountOptions,
    persistedBalance,
    drafts,
    setDrafts,
    isSubmitting,
    isEditSubmitting,
    onEditDraft,
  } = args;
  const derivedState = useStatementImportReviewDerivedState({
    account,
    accountBookStartDate,
    accountOptions,
    persistedBalance,
    drafts,
    isSubmitting,
    isEditSubmitting,
  });
  const columnDefs = useStatementImportColumnDefs({
    account,
    counterAccountOptions: derivedState.counterAccountOptions,
    isSubmitting,
    statuses: derivedState.statuses,
    onEditDraft,
  });

  function handleDraftCellChange(
    event: CellValueChangedEvent<StatementImportGridRow>,
  ) {
    if (!isStatementImportReviewDraftRow(event.data)) {
      return;
    }
    if (event.data.ignored) {
      return;
    }

    if (event.colDef.field === "description") {
      setDrafts((current) =>
        current.map((draft) =>
          draft.id === event.data?.id
            ? updateStatementImportDraftDescription({
                draft,
                description: String(event.newValue ?? ""),
              })
            : draft,
        ),
      );
      return;
    }

    if (event.colDef.field === "counterAccountId") {
      if (!hasStatementImportSingleCounterBooking(event.data)) {
        return;
      }

      const selectedAccount = derivedState.counterAccountOptions.find(
        (option) => option.value === event.newValue,
      );
      setDrafts((current) =>
        current.map((draft) =>
          draft.id === event.data?.id
            ? updateStatementImportDraftCounterAccount({
                draft,
                selectedAccount,
              })
            : draft,
        ),
      );
    }
  }

  function handleSelectionChange(
    event: SelectionChangedEvent<StatementImportGridRow>,
  ) {
    // Grid initialization and API synchronization must not change inclusion.
    if (
      event.source !== "checkboxSelected" &&
      event.source !== "spaceKey" &&
      event.source !== "keyboardSelectAll" &&
      event.source !== "uiSelectAll" &&
      event.source !== "uiSelectAllFiltered" &&
      event.source !== "uiSelectAllCurrentPage"
    ) {
      return;
    }
    if (isSubmitting || isEditSubmitting) {
      syncDraftSelection(event.api);
      return;
    }

    const selectedDraftIds = event.api
      .getSelectedRows()
      .filter(isStatementImportReviewDraftRow)
      .map((draft) => draft.id);
    setDrafts((current) =>
      setStatementImportDraftSelection({ drafts: current, selectedDraftIds }),
    );
  }

  function syncDraftSelection(api: GridApi<StatementImportGridRow>) {
    const nodesToSelect: IRowNode<StatementImportGridRow>[] = [];
    const nodesToDeselect: IRowNode<StatementImportGridRow>[] = [];
    api.forEachNode((node) => {
      const selected =
        isStatementImportReviewDraftRow(node.data) && !node.data.ignored;
      if (node.isSelected() !== selected) {
        (selected ? nodesToSelect : nodesToDeselect).push(node);
      }
    });
    if (nodesToSelect.length > 0) {
      api.setNodesSelected({
        nodes: nodesToSelect,
        newValue: true,
        source: "api",
      });
    }
    if (nodesToDeselect.length > 0) {
      api.setNodesSelected({
        nodes: nodesToDeselect,
        newValue: false,
        source: "api",
      });
    }
  }

  function handleReviewRowsUpdated(
    event:
      | RowDataUpdatedEvent<StatementImportGridRow>
      | FirstDataRenderedEvent<StatementImportGridRow>,
  ) {
    syncDraftSelection(event.api);
  }

  return {
    columnDefs,
    handleDraftCellChange,
    handleSelectionChange,
    handleReviewRowsUpdated,
    ignoredCount: derivedState.ignoredCount,
    importDisabled: derivedState.importDisabled,
    includedCount: derivedState.includedCount,
    readyCount: derivedState.readyCount,
    reviewRows: derivedState.reviewRows,
    summaryText: derivedState.summaryText,
  };
}
