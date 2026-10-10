import { useState } from "react";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import type { AccountOption } from "@/components/edit-transaction-modal";
import type { TransactionMutationValues } from "./-page-view";
import type { LedgerAccount } from "./-page-types";
import {
  updateStatementImportDraftTransaction,
  type StatementImportCsvFormat,
  type StatementImportDraft,
} from "./-statement-import";
import { getStatementImportTransactionsToSubmit } from "./-statement-import-page-controller";
import { useStatementImportReviewState } from "./-statement-import-page-review-state";
import { useStatementImportUploadState } from "./-statement-import-page-upload-state";
import { getStatementImportReviewSnapshot } from "./-statement-import-dirty-state";

export function useStatementImportPageState(args: {
  accountBookId: string;
  account: LedgerAccount;
  statementImportCsvFormat: StatementImportCsvFormat;
  accountBookStartDate: Date;
  accountOptions: AccountOption[];
  persistedBalance: number;
  isSubmitting: boolean;
  isImportComplete: boolean;
  onSubmittingChange: (isSubmitting: boolean) => void;
  onSubmit: (transactions: TransactionMutationValues[]) => Promise<void>;
}) {
  const {
    account,
    accountBookStartDate,
    accountOptions,
    persistedBalance,
    isSubmitting,
    onSubmittingChange,
    onSubmit,
  } = args;
  const [drafts, setDrafts] = useState<StatementImportDraft[]>([]);
  const [editingDraftId, setEditingDraftId] = useState<string | undefined>();
  const [isEditSubmitting, setIsEditSubmitting] = useState(false);
  const [isEditorDirty, setIsEditorDirty] = useState(false);
  const [isReviewCellDirty, setIsReviewCellDirty] = useState(false);
  const [reviewBaseline, setReviewBaseline] = useState(() =>
    getStatementImportReviewSnapshot([]),
  );
  const guard = useUnsavedChangesGuard(
    !args.isImportComplete &&
      (getStatementImportReviewSnapshot(drafts) !== reviewBaseline ||
        isEditorDirty ||
        isReviewCellDirty),
  );

  const editingDraft = drafts.find((draft) => draft.id === editingDraftId);
  const reviewState = useStatementImportReviewState({
    account,
    accountBookStartDate,
    accountOptions,
    persistedBalance,
    drafts,
    setDrafts,
    isSubmitting,
    isEditSubmitting,
    onEditDraft: setEditingDraftId,
  });
  const uploadState = useStatementImportUploadState({
    accountBookId: args.accountBookId,
    account,
    statementImportCsvFormat: args.statementImportCsvFormat,
    draftsLength: drafts.length,
    isSubmitting,
    isEditSubmitting,
    setDrafts: (nextDrafts) => {
      setReviewBaseline(getStatementImportReviewSnapshot(nextDrafts));
      setDrafts(nextDrafts);
    },
    clearEditingDraft: () => {
      setEditingDraftId(undefined);
      setIsEditorDirty(false);
      setIsReviewCellDirty(false);
    },
    requestConfirmation: guard.requestConfirmation,
  });

  async function handleImport() {
    onSubmittingChange(true);
    try {
      await onSubmit(getStatementImportTransactionsToSubmit(drafts));
    } finally {
      onSubmittingChange(false);
    }
  }

  function handleSaveDraft(values: TransactionMutationValues) {
    if (!editingDraft) return Promise.resolve();
    setDrafts((current) =>
      current.map((draft) =>
        draft.id === editingDraft.id
          ? updateStatementImportDraftTransaction({
              draft,
              transaction: values,
            })
          : draft,
      ),
    );
    setEditingDraftId(undefined);
    setIsEditorDirty(false);
    return Promise.resolve();
  }

  function closeEditDraft() {
    if (isEditSubmitting) return;
    setEditingDraftId(undefined);
    setIsEditorDirty(false);
  }

  return {
    activeStep: uploadState.activeStep,
    canReviewStatementImport: uploadState.canReviewStatementImport,
    columnDefs: reviewState.columnDefs,
    discardModalOpened: guard.isConfirmationOpen,
    discardAction: guard.isNavigationBlocked
      ? ("leave" as const)
      : ("upload" as const),
    confirmDiscard: guard.confirm,
    closeDiscardModal: guard.cancel,
    setIsEditorDirty,
    setIsReviewCellDirty,
    drafts,
    editingDraft,
    file: uploadState.file,
    handleDraftCellChange: reviewState.handleDraftCellChange,
    handleFileChange: uploadState.handleFileChange,
    handleImport,
    handleSaveDraft,
    handleSelectionChange: reviewState.handleSelectionChange,
    handleReviewRowsUpdated: reviewState.handleReviewRowsUpdated,
    handleStepClick: uploadState.handleStepClick,
    ignoredCount: reviewState.ignoredCount,
    importDisabled: args.isImportComplete || reviewState.importDisabled,
    includedCount: reviewState.includedCount,
    isEditSubmitting,
    parseErrors: uploadState.parseErrors,
    isCheckingExistingBookings: uploadState.isCheckingExistingBookings,
    readyCount: reviewState.readyCount,
    reviewRows: reviewState.reviewRows,
    setIsEditSubmitting,
    closeEditDraft,
    summaryText: reviewState.summaryText,
  };
}
