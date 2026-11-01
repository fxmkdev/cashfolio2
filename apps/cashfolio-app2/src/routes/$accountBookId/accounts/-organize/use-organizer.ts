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

export function useOrganizer(onSaved: () => void, apiOverride: OrganizerApi) {
  const api = useRef(apiOverride).current;
  const [snapshot, setSnapshot] = useState<OrganizeSnapshot>();
  const confirmed = useRef<OrganizeSnapshot | undefined>(undefined);
  const [undo, setUndo] = useState<OrganizeUndo | null>(null);
  const [loadError, setLoadError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [revealIds, setRevealIds] = useState<string[]>([]);
  const mounted = useRef(true);
  const attempted = useRef<
    { move?: OrganizeMove; undo?: OrganizeUndo; version: string } | undefined
  >(undefined);
  const refresh = useCallback(async () => {
    const next = await api.load();
    if (!mounted.current) return;
    if (confirmed.current?.version !== next.version) setUndo(null);
    confirmed.current = next;
    setSnapshot(next);
    setLoadError(undefined);
  }, [api]);
  useEffect(() => {
    mounted.current = true;
    void refresh()
      .catch(() => {
        if (mounted.current)
          setLoadError("Could not load the account hierarchy.");
      })
      .finally(() => {
        if (mounted.current) setLoading(false);
      });
    return () => {
      mounted.current = false;
    };
  }, [refresh]);
  const submitState = useDialogSubmitState({
    captureErrors: true,
    onRefreshConstraints: refresh,
  });
  const pending = submitState.isSubmitting || submitState.isRefreshing;
  const needsRefresh = !!submitState.refreshError;

  const saveMove = async (move: OrganizeMove) => {
    const before = confirmed.current;
    if (!before || pending || needsRefresh) return false;
    return submitState.runSubmit(async () => {
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
  };
  const undoMove = async () => {
    const before = confirmed.current;
    if (!before || !undo || pending || needsRefresh) return;
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
