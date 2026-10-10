import type { CellValueChangedEvent } from "ag-grid-enterprise";
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
  type StatementImportGridRow,
} from "./-statement-import-page-controller";
import { useStatementImportInclusionState } from "./-statement-import-inclusion-state";
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
  const inclusionState = useStatementImportInclusionState({
    setDrafts,
    disabled: isSubmitting || isEditSubmitting,
  });
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

  return {
    columnDefs,
    handleDraftCellChange,
    ...inclusionState,
    ignoredCount: derivedState.ignoredCount,
    importDisabled: derivedState.importDisabled,
    includedCount: derivedState.includedCount,
    readyCount: derivedState.readyCount,
    reviewRows: derivedState.reviewRows,
    summaryText: derivedState.summaryText,
  };
}
