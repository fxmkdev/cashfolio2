import { useRef, useState } from "react";
import {
  getStatementImportExistingBookings,
  type StatementImportExistingBooking,
} from "@/server/statement-import";
import { matchStatementImportDrafts } from "./-statement-import-matching";
import type { LedgerAccount } from "./-page-types";
import {
  parseStatementImportCsv,
  type StatementImportCsvFormat,
  type StatementImportDraft,
} from "./-statement-import";

export type StatementImportPageStep = "upload" | "review";

export function useStatementImportUploadState(args: {
  accountBookId: string;
  account: LedgerAccount;
  statementImportCsvFormat: StatementImportCsvFormat;
  draftsLength: number;
  isSubmitting: boolean;
  isEditSubmitting: boolean;
  setDrafts: (drafts: StatementImportDraft[]) => void;
  setExistingBookings: (bookings: StatementImportExistingBooking[]) => void;
  clearEditingDraft: () => void;
  requestConfirmation: (action: () => void) => void;
}) {
  const {
    account,
    statementImportCsvFormat,
    draftsLength,
    isSubmitting,
    isEditSubmitting,
    setDrafts,
    setExistingBookings,
    clearEditingDraft,
    requestConfirmation,
  } = args;
  const [file, setFile] = useState<File | null>(null);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [isCheckingExistingBookings, setIsCheckingExistingBookings] =
    useState(false);
  const [activeStep, setActiveStep] =
    useState<StatementImportPageStep>("upload");
  const fileReadRequestId = useRef(0);

  const canReviewStatementImport =
    !isCheckingExistingBookings && draftsLength > 0 && parseErrors.length === 0;
  const canNavigateStatementImportSteps = !isSubmitting && !isEditSubmitting;

  async function handleFileChange(nextFile: File | null) {
    const requestId = fileReadRequestId.current + 1;
    fileReadRequestId.current = requestId;
    setFile(nextFile);
    clearStatementImportReviewState();
    setIsCheckingExistingBookings(false);
    setActiveStep("upload");
    if (!nextFile) {
      return;
    }

    setIsCheckingExistingBookings(true);
    try {
      const text = await nextFile.text();
      if (requestId !== fileReadRequestId.current) return;

      const result = parseStatementImportCsv({
        text,
        currentAccount: account,
        format: statementImportCsvFormat,
      });
      setParseErrors(result.errors);
      if (result.errors.length > 0 || result.drafts.length === 0) return;

      const bookings = await getStatementImportExistingBookings({
        data: {
          accountBookId: args.accountBookId,
          accountId: account.id,
        },
      });
      if (requestId !== fileReadRequestId.current) return;

      setExistingBookings(bookings);
      setDrafts(matchStatementImportDrafts(result.drafts, bookings));
      setActiveStep("review");
    } catch {
      if (requestId !== fileReadRequestId.current) return;
      setParseErrors([
        "Could not read the statement or check for existing transactions. Please upload the file again to retry.",
      ]);
    } finally {
      if (requestId === fileReadRequestId.current) {
        setIsCheckingExistingBookings(false);
      }
    }
  }

  function resetStatementImportReview() {
    fileReadRequestId.current += 1;
    setIsCheckingExistingBookings(false);
    setFile(null);
    clearStatementImportReviewState();
    setActiveStep("upload");
  }

  function handleStepClick(nextStep: number) {
    if (nextStep === 0) {
      handleUploadStepClick();
      return;
    }

    handleReviewStepClick();
  }

  function handleUploadStepClick() {
    if (activeStep === "upload" || !canNavigateStatementImportSteps) {
      return;
    }

    requestConfirmation(resetStatementImportReview);
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
    setExistingBookings([]);
    clearEditingDraft();
  }

  return {
    activeStep,
    canReviewStatementImport,
    file,
    handleFileChange,
    handleStepClick,
    isCheckingExistingBookings,
    parseErrors,
    resetStatementImportReview,
  };
}
