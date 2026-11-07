import { useEffect, useState } from "react";

/** Hide stale data synchronously, and ignore requests superseded by a new scope. */
export function useGainLossRequest<T>(args: {
  enabled: boolean;
  scopeKey: string;
  refreshKey: unknown;
  load: (signal: AbortSignal) => Promise<T>;
  errorMessage?: string;
}) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    scopeKey: string;
    refreshKey: unknown;
    attempt: number;
    data?: T;
    error?: string;
    loading: boolean;
  }>();
  const { enabled, scopeKey, refreshKey, load, errorMessage } = args;
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const controller = new AbortController();
    setState({ scopeKey, refreshKey, attempt, loading: true });
    void load(controller.signal)
      .then((data) => {
        if (active)
          setState({ scopeKey, refreshKey, attempt, data, loading: false });
      })
      .catch(() => {
        if (active)
          setState({
            scopeKey,
            refreshKey,
            attempt,
            error:
              errorMessage ??
              "Gain/loss could not be loaded. Please try again.",
            loading: false,
          });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [enabled, scopeKey, refreshKey, attempt, load, errorMessage]);
  const current =
    state?.scopeKey === scopeKey &&
    state.refreshKey === refreshKey &&
    state.attempt === attempt
      ? state
      : undefined;
  return {
    data: enabled ? current?.data : undefined,
    error: enabled ? current?.error : undefined,
    loading: enabled && (current?.loading ?? true),
    retry: () => setAttempt((value) => value + 1),
  };
}
