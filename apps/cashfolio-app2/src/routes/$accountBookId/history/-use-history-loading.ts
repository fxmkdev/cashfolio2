import { useEffect, useState } from "react";
import type { PeriodHistoryResponse } from "@/server/period-history";
import {
  loadCompleteHistory,
  type HistoryLoadRequest,
} from "./-history-loading";
import { loadHistoryBatch } from "./-page-loader";

type LoadState = {
  key: string;
  history?: PeriodHistoryResponse;
  error?: Error;
};

export function useHistoryLoading(
  request: HistoryLoadRequest,
  reloadKey: string,
) {
  const key = `${reloadKey}:${JSON.stringify(request)}`;
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<LoadState>({ key });

  useEffect(() => {
    const controller = new AbortController();
    setState({ key });
    void loadCompleteHistory(request, loadHistoryBatch, controller.signal)
      .then((history) => {
        if (!controller.signal.aborted) setState({ key, history });
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setState({
            key,
            error:
              cause instanceof Error
                ? cause
                : new Error("History could not be loaded. Please retry."),
          });
      });
    return () => controller.abort();
  }, [request, reloadKey, key, retry]);

  const current: LoadState = state.key === key ? state : { key };
  return { ...current, retry: () => setRetry((value) => value + 1) };
}
