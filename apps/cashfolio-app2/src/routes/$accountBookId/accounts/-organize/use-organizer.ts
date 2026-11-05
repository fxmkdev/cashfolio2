import { useCallback, useEffect, useRef, useState } from "react";
import { useDialogSubmitState } from "@/hooks/use-dialog-submit-state";
import { planAccountMove } from "@/shared/account-organize/move";
import type {
  OrganizeMove,
  OrganizeMoveResult,
  OrganizeSnapshot,
  OrganizeUndo,
} from "@/shared/account-organize/types";

export type OrganizerApi = {
  load: () => Promise<OrganizeSnapshot>;
  move: (move: OrganizeMove, version: string) => Promise<OrganizeMoveResult>;
  undo: (undo: OrganizeUndo) => Promise<OrganizeSnapshot>;
};

export function useOrganizer(
  onSaved: () => void,
  apiOverride?: OrganizerApi,
  autoLoad = true,
) {
  const api = useRef(apiOverride).current;
  const [snapshot, setSnapshot] = useState<OrganizeSnapshot>();
  const confirmed = useRef<OrganizeSnapshot | undefined>(undefined);
  const [undo, setUndo] = useState<OrganizeUndo | null>(null);
  const [loadError, setLoadError] = useState<string>();
  const [loading, setLoading] = useState(autoLoad);
  const [message, setMessage] = useState("");
  const [revealIds, setRevealIds] = useState<string[]>([]);
  const mounted = useRef(true);
  const generation = useRef(0);
  const loadInFlight = useRef<number | undefined>(undefined);
  const attempted = useRef<
    { move?: OrganizeMove; undo?: OrganizeUndo; version: string } | undefined
  >(undefined);
  const refresh = useCallback(async () => {
    if (!api) throw new Error("Organize is unavailable.");
    const current = generation.current;
    const next = await api.load();
    if (!mounted.current || current !== generation.current) return;
    if (confirmed.current?.version !== next.version) setUndo(null);
    confirmed.current = next;
    setSnapshot(next);
    setLoadError(undefined);
  }, [api]);
  const submitState = useDialogSubmitState({
    captureErrors: true,
    onRefreshConstraints: refresh,
  });
  const pending = submitState.isSubmitting || submitState.isRefreshing;
  const needsRefresh = !!submitState.refreshError;
  const { runSubmit } = submitState;
  const { clearSubmissionError, clearRefreshError } = submitState;
  const load = useCallback(async () => {
    if (!api || loadInFlight.current !== undefined) return false;
    const current = generation.current;
    loadInFlight.current = current;
    setLoading(true);
    setLoadError(undefined);
    clearSubmissionError();
    clearRefreshError();
    try {
      await refresh();
      return mounted.current && current === generation.current;
    } catch {
      if (mounted.current && current === generation.current)
        setLoadError("Could not load the account hierarchy.");
      return false;
    } finally {
      if (current === generation.current) {
        loadInFlight.current = undefined;
        if (mounted.current) setLoading(false);
      }
    }
  }, [api, clearRefreshError, clearSubmissionError, refresh]);
  const invalidateLoad = useCallback(() => {
    generation.current++;
    loadInFlight.current = undefined;
  }, []);
  const reset = useCallback(() => {
    invalidateLoad();
    confirmed.current = undefined;
    attempted.current = undefined;
    setSnapshot(undefined);
    setUndo(null);
    setLoading(false);
    setLoadError(undefined);
    setMessage("");
    setRevealIds([]);
    clearSubmissionError();
    clearRefreshError();
  }, [clearRefreshError, clearSubmissionError, invalidateLoad]);
  useEffect(() => {
    mounted.current = true;
    if (autoLoad) void load();
    return () => {
      mounted.current = false;
      invalidateLoad();
    };
  }, [autoLoad, invalidateLoad, load]);

  const saveMove = useCallback(
    async (move: OrganizeMove) => {
      const before = confirmed.current;
      if (!api || !before || pending || needsRefresh) return false;
      return runSubmit(async () => {
        attempted.current = { move, version: before.version };
        const next = planAccountMove(before.nodes, move);
        if (next === before.nodes) {
          setMessage("The items are already in that position.");
          return;
        }
        setSnapshot({ ...before, nodes: next });
        try {
          const result = await api.move(move, before.version);
          if (!mounted.current) return;
          confirmed.current = result.snapshot;
          setSnapshot(result.snapshot);
          if (result.undo) setUndo(result.undo);
          setRevealIds(move.items.map((item) => item.id));
          setMessage(
            result.undo
              ? "Move saved."
              : "The items are already in that position.",
          );
          onSaved();
        } catch (error) {
          if (mounted.current) setSnapshot(before);
          throw error;
        }
      });
    },
    [api, needsRefresh, onSaved, pending, runSubmit],
  );
  const undoMove = async () => {
    const before = confirmed.current;
    if (!api || !before || !undo || pending || needsRefresh) return;
    await submitState.runSubmit(async () => {
      attempted.current = { undo, version: before.version };
      const result = await api.undo(undo);
      if (!mounted.current) return;
      confirmed.current = result;
      setSnapshot(result);
      setUndo(null);
      setRevealIds(undo.restore.map((item) => item.id));
      setMessage("Move undone.");
      onSaved();
    });
  };
  const retry = () => {
    if (
      !submitState.submissionError?.isBusy ||
      attempted.current?.version !== confirmed.current?.version
    )
      return;
    if (attempted.current?.move) void saveMove(attempted.current.move);
    else if (attempted.current?.undo) void undoMove();
  };
  return {
    load,
    reset,
    snapshot,
    loading,
    loadError,
    refresh,
    undo,
    undoMove,
    saveMove,
    pending,
    blocked: pending || needsRefresh || loading || !snapshot,
    message,
    revealIds,
    submitState,
    retry,
    retryDisabled: attempted.current?.version !== confirmed.current?.version,
  };
}

export type Organizer = ReturnType<typeof useOrganizer>;
