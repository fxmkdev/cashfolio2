import { useCallback, useEffect, useRef, useState } from "react";
import { getMutationError } from "../shared/mutation-errors";

export function useDialogSubmitState({
  onSubmittingChange,
  captureErrors = false,
  onRefreshConstraints,
}: {
  onSubmittingChange?: (isSubmitting: boolean) => void;
  captureErrors?: boolean;
  onRefreshConstraints?: () => Promise<void>;
} = {}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);
  const [submissionError, setSubmissionError] = useState<ReturnType<
    typeof getMutationError
  > | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const isRefreshingRef = useRef(false);
  const waitingTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const refreshRef = useRef(onRefreshConstraints);
  refreshRef.current = onRefreshConstraints;
  const isSubmittingRef = useRef(false);
  const onSubmittingChangeRef = useRef(onSubmittingChange);

  useEffect(() => {
    onSubmittingChangeRef.current = onSubmittingChange;
  }, [onSubmittingChange]);

  const setSubmitting = useCallback((next: boolean) => {
    clearTimeout(waitingTimer.current);
    setIsWaiting(false);
    if (next) {
      waitingTimer.current = setTimeout(() => setIsWaiting(true), 2_000);
    }
    isSubmittingRef.current = next;
    setIsSubmitting(next);
    onSubmittingChangeRef.current?.(next);
  }, []);

  const refreshConstraints = useCallback(async () => {
    if (!refreshRef.current || isRefreshingRef.current) return;
    isRefreshingRef.current = true;
    setIsRefreshing(true);
    setRefreshError(null);
    try {
      await refreshRef.current();
    } catch {
      setRefreshError(
        "Could not refresh choices. Your draft is still here. Please try refreshing again.",
      );
    } finally {
      isRefreshingRef.current = false;
      setIsRefreshing(false);
    }
  }, []);

  const runSubmit = useCallback(
    async (submit: () => void | Promise<void>) => {
      if (isSubmittingRef.current || isRefreshingRef.current) return false;

      setSubmissionError(null);
      setRefreshError(null);
      setSubmitting(true);
      try {
        await submit();
        return true;
      } catch (error) {
        if (!captureErrors) throw error;
        setSubmissionError(getMutationError(error));
        clearTimeout(waitingTimer.current);
        setIsWaiting(false);
        await refreshConstraints();
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [captureErrors, refreshConstraints, setSubmitting],
  );

  useEffect(() => {
    return () => {
      clearTimeout(waitingTimer.current);
      if (isSubmittingRef.current) {
        onSubmittingChangeRef.current?.(false);
      }
    };
  }, []);

  const clearSubmissionError = useCallback(() => setSubmissionError(null), []);
  return {
    isSubmitting,
    isWaiting,
    submissionError,
    refreshError,
    isRefreshing,
    refreshConstraints,
    clearSubmissionError,
    runSubmit,
  };
}
