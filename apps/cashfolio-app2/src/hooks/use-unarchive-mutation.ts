import { useEffect, useState } from "react";
import { useDialogSubmitState } from "./use-dialog-submit-state";

export type UnarchiveTarget = {
  id: string;
  name: string;
  nodeType: "account" | "accountGroup";
};

export function useUnarchiveMutation({
  scopeKey,
  onUnarchive,
  onRefreshConstraints,
  isEligible,
  formatErrorMessage,
}: {
  scopeKey: string;
  formatErrorMessage?: (message: string) => string;
  onUnarchive: (target: UnarchiveTarget) => Promise<void>;
  onRefreshConstraints: () => Promise<void>;
  isEligible: (target: UnarchiveTarget) => boolean;
}) {
  const [target, setTarget] = useState<UnarchiveTarget | null>(null);
  const submitState = useDialogSubmitState({
    captureErrors: true,
    formatErrorMessage,
    onRefreshConstraints,
  });
  useEffect(() => setTarget(null), [scopeKey]);
  const unarchive = async (nextTarget: UnarchiveTarget) => {
    await submitState.runSubmit(async () => {
      setTarget(nextTarget);
      await onUnarchive(nextTarget);
      setTarget(null);
    });
  };
  const retryDisabled = !target || !isEligible(target);
  const retry = () => {
    if (!target || retryDisabled || !submitState.submissionError?.isBusy)
      return;
    return unarchive(target);
  };
  return {
    target,
    submitState,
    unarchive,
    retry,
    retryDisabled,
    isPending: submitState.isSubmitting || submitState.isRefreshing,
  };
}
