import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { LedgerAccount } from "./-page-types";
import {
  parseStatementImportCsv,
  type StatementImportCsvFormat,
  type StatementImportDraft,
} from "./-statement-import";

export type StatementImportPageStep = "upload" | "review";

export function useStatementImportUploadState(args: {
  account: LedgerAccount;
  statementImportCsvFormat: StatementImportCsvFormat;
  draftsLength: number;
  isSubmitting: boolean;
  isEditSubmitting: boolean;
  setDrafts: Dispatch<SetStateAction<StatementImportDraft[]>>;
  clearEditingDraft: () => void;
}) {
  const {
    account,
    statementImportCsvFormat,
    draftsLength,
    isSubmitting,
    isEditSubmitting,
    setDrafts,
    clearEditingDraft,
  } = args;
  const [file, setFile] = useState<File | null>(null);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [activeStep, setActiveStep] =
    useState<StatementImportPageStep>("upload");
  const [discardUploadModalOpened, setDiscardUploadModalOpened] =
    useState(false);
  const fileReadRequestId = useRef(0);

  const canReviewStatementImport = draftsLength > 0 && parseErrors.length === 0;
  const canNavigateStatementImportSteps = !isSubmitting && !isEditSubmitting;

  async function handleFileChange(nextFile: File | null) {
    const requestId = fileReadRequestId.current + 1;
    fileReadRequestId.current = requestId;
    setFile(nextFile);
    clearStatementImportReviewState();
    setActiveStep("upload");
    setDiscardUploadModalOpened(false);
    if (!nextFile) {
      return;
    }

    const text = await nextFile.text();
    if (requestId !== fileReadRequestId.current) {
      return;
    }

    const result = parseStatementImportCsv({
      text,
      currentAccount: account,
      format: statementImportCsvFormat,
    });
    if (requestId !== fileReadRequestId.current) {
      return;
    }

    setParseErrors(result.errors);
    setDrafts(result.drafts);
    if (result.errors.length === 0 && result.drafts.length > 0) {
      setActiveStep("review");
    }
  }

  function resetStatementImportReview() {
    fileReadRequestId.current += 1;
    setFile(null);
    clearStatementImportReviewState();
    setDiscardUploadModalOpened(false);
    setActiveStep("upload");
  }

  function handleStepClick(nextStep: number) {
    if (nextStep === 0) {
      handleUploadStepClick();
      return;
    }

    handleReviewStepClick();
  }

  function closeDiscardUploadModal() {
    setDiscardUploadModalOpened(false);
  }

  function handleUploadStepClick() {
    if (activeStep === "upload" || !canNavigateStatementImportSteps) {
      return;
    }

    if (draftsLength > 0) {
      setDiscardUploadModalOpened(true);
      return;
    }

    resetStatementImportReview();
  }

  function handleReviewStepClick() {
    if (!canNavigateStatementImportSteps || !canReviewStatementImport) {
      return;
    }

    setActiveStep("review");
  }

  function clearStatementImportReviewState() {
    setParseErrors([]);
    setDrafts([]);
    clearEditingDraft();
  }

  return {
    activeStep,
    canReviewStatementImport,
    closeDiscardUploadModal,
    discardUploadModalOpened,
    file,
    handleFileChange,
    handleStepClick,
    parseErrors,
    resetStatementImportReview,
  };
}
