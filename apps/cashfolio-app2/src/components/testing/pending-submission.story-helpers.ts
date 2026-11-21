import type { useDialogSubmitState } from "@/hooks/use-dialog-submit-state";
import { fn } from "storybook/test";

/** Keep a submission pending for inspection. Unmounting the story discards it. */
export function pendingStorySubmission(): Promise<void> {
  return new Promise<void>(() => {});
}

/** An inspectable pending state, supplied through the existing dialog interface. */
export function createPendingStorySubmitState(): ReturnType<
  typeof useDialogSubmitState
> {
  return {
    isSubmitting: true,
    isWaiting: false,
    submissionError: null,
    refreshError: null,
    isRefreshing: false,
    refreshConstraints: fn(async () => undefined),
    clearSubmissionError: fn(),
    clearRefreshError: fn(),
    runSubmit: fn(async () => false),
  };
}
