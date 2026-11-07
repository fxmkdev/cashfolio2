import { useCallback, useEffect, useState } from "react";
import { getAccountReturnSummaries } from "@/server/account-returns";
import { useGainLossRequest } from "@/hooks/use-gain-loss-request";
import type { AccountReturnTarget } from "@/shared/account-returns";
import type { ReportingGrouping } from "@/shared/reporting-grouping";

export function useAccountReturns(args: {
  accountBookId: string;
  grouping: ReportingGrouping;
  enabled: boolean;
  refreshKey: unknown;
}) {
  const { accountBookId, grouping } = args;
  const scopeKey = `${accountBookId}:${grouping}`;
  const load = useCallback(
    () =>
      getAccountReturnSummaries({
        data: { accountBookId, grouping, accountState: "all" },
      }),
    [accountBookId, grouping],
  );
  const request = useGainLossRequest({
    ...args,
    load,
    scopeKey,
    errorMessage: "Returns could not be loaded. Please try again.",
  });
  const [selection, setSelection] = useState<{
    scopeKey: string;
    target: AccountReturnTarget;
  }>();
  useEffect(() => setSelection(undefined), [scopeKey, args.enabled]);
  const onOpen = useCallback(
    (target: AccountReturnTarget) => setSelection({ scopeKey, target }),
    [scopeKey],
  );
  return {
    ...request,
    onOpen,
    target:
      args.enabled && selection?.scopeKey === scopeKey
        ? selection.target
        : undefined,
    onClose: () => setSelection(undefined),
  };
}
