import { fetchWithResourceErrors } from "@/shared/resource-fetch";
import { loadCompleteReturnWork } from "@/shared/load-return-work";
import { useCallback, useEffect, useState } from "react";
import { getAccountReturnSummaries } from "@/server/account-returns";
import { useGainLossRequest } from "@/hooks/use-gain-loss-request";
import {
  emptyAccountReturnResult,
  type AccountReturnProgress,
  type AccountReturnSummaries,
  type AccountReturnTarget,
} from "@/shared/account-returns";
import type { ReportingGrouping } from "@/shared/reporting-grouping";

export function useAccountReturns(args: {
  accountBookId: string;
  grouping: ReportingGrouping;
  enabled: boolean;
  refreshKey: unknown;
}) {
  const { accountBookId, grouping } = args;
  const scopeKey = `${accountBookId}:${grouping}`;
  const [partial, setPartial] = useState<{
    scopeKey: string;
    refreshKey: unknown;
    progress: AccountReturnProgress;
  }>();
  const load = useCallback(
    (signal: AbortSignal) =>
      loadCompleteReturnWork(
        (continuation, batchSize) =>
          getAccountReturnSummaries({
            signal,
            fetch: fetchWithResourceErrors,
            data: {
              accountBookId,
              grouping,
              accountState: "all",
              continuation,
              batchSize,
            },
          }),
        signal,
        (progress) => {
          if (signal.aborted) return;
          setPartial(
            progress
              ? { scopeKey, refreshKey: args.refreshKey, progress }
              : undefined,
          );
        },
      ),
    [accountBookId, grouping, scopeKey, args.refreshKey],
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
  const progress =
    args.enabled &&
    partial?.scopeKey === scopeKey &&
    partial.refreshKey === args.refreshKey
      ? partial.progress
      : undefined;
  const partialData: AccountReturnSummaries | undefined = progress
    ? {
        referenceCurrency: progress.referenceCurrency,
        startDate: progress.startDate,
        asOfDate: progress.asOfDate,
        rows: progress.rows,
        total: progress.totalResult ?? emptyAccountReturnResult(),
      }
    : undefined;
  const completedIds = request.data
    ? undefined
    : progress
      ? new Set([
          ...progress.rows.map((row) => row.id),
          ...(progress.totalResult ? ["__return_total__"] : []),
        ])
      : undefined;
  return {
    ...request,
    data: request.data ?? partialData,
    completedIds,
    cellVersion: `${scopeKey}:${progress?.workId ?? ""}:${progress?.sequence ?? 0}:${request.loading}`,

    onOpen,
    target:
      args.enabled && selection?.scopeKey === scopeKey
        ? selection.target
        : undefined,
    onClose: () => setSelection(undefined),
  };
}
