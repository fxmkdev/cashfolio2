import { useState } from "react";
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

export function useStatementImportPageState(args: {
  account: LedgerAccount;
  statementImportCsvFormat: StatementImportCsvFormat;
  accountBookStartDate: Date;
  accountOptions: AccountOption[];
  persistedBalance: number;
  isSubmitting: boolean;
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
    account,
    statementImportCsvFormat: args.statementImportCsvFormat,
    draftsLength: drafts.length,
    isSubmitting,
    isEditSubmitting,
    setDrafts,
    clearEditingDraft: () => setEditingDraftId(undefined),
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
    return Promise.resolve();
  }

  function closeEditDraft() {
    if (isEditSubmitting) return;
    setEditingDraftId(undefined);
  }

  return {
    activeStep: uploadState.activeStep,
    canReviewStatementImport: uploadState.canReviewStatementImport,
    columnDefs: reviewState.columnDefs,
    discardUploadModalOpened: uploadState.discardUploadModalOpened,
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
    importDisabled: reviewState.importDisabled,
    includedCount: reviewState.includedCount,
    isEditSubmitting,
    parseErrors: uploadState.parseErrors,
    readyCount: reviewState.readyCount,
    reviewRows: reviewState.reviewRows,
    resetStatementImportReview: uploadState.resetStatementImportReview,
    closeDiscardUploadModal: uploadState.closeDiscardUploadModal,
    setIsEditSubmitting,
    closeEditDraft,
    summaryText: reviewState.summaryText,
  };
}
