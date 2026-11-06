import { useCallback, useEffect, useRef, useState } from "react";
import { organizeLifecycleAvailability } from "./lifecycle";
import { useDialogSubmitState } from "@/hooks/use-dialog-submit-state";
import { organizeDisplayRows } from "@/shared/account-organize/tree";
import { planAccountMove } from "@/shared/account-organize/move";
import type {
  OrganizeMove,
  OrganizeMoveResult,
  OrganizeSnapshot,
  OrganizeNodeRef,
  OrganizeLifecycleAction,
} from "@/shared/account-organize/types";

export type OrganizerApi = {
  load: () => Promise<OrganizeSnapshot>;
  move: (move: OrganizeMove, version: string) => Promise<OrganizeMoveResult>;
  archive: (target: OrganizeNodeRef) => Promise<unknown>;
  unarchive: (target: OrganizeNodeRef) => Promise<unknown>;
  delete: (target: OrganizeNodeRef) => Promise<unknown>;
};

export function useOrganizer(
  onSaved: () => void,
  apiOverride?: OrganizerApi,
  autoLoad = true,
) {
  const api = useRef(apiOverride).current;
  const [snapshot, setSnapshot] = useState<OrganizeSnapshot>();
  const confirmed = useRef<OrganizeSnapshot | undefined>(undefined);
  const [loadError, setLoadError] = useState<string>();
  const [loading, setLoading] = useState(autoLoad);
  const [message, setMessage] = useState("");
  const [revealIds, setRevealIds] = useState<string[]>([]);
  const [focusFallbackIds, setFocusFallbackIds] = useState<string[]>([]);
  const mounted = useRef(true);
  const generation = useRef(0);
  const loadInFlight = useRef<number | undefined>(undefined);
  const attempted = useRef<
    | {
        move?: OrganizeMove;
        lifecycle?: {
          action: OrganizeLifecycleAction;
          target: OrganizeNodeRef;
        };
        version: string;
      }
    | undefined
  >(undefined);
  const refresh = useCallback(async () => {
    if (!api) throw new Error("Organize is unavailable.");
    const current = generation.current;
    const next = await api.load();
    if (!mounted.current || current !== generation.current) return;
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
    setLoading(false);
    setLoadError(undefined);
    setMessage("");
    setRevealIds([]);
    setFocusFallbackIds([]);
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
          setRevealIds(move.items.map((item) => item.id));
          setFocusFallbackIds([]);
          setMessage(
            result.changed
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
  // Shared confirmation dialogs and direct unarchive wrap this in runSubmit,
  // so movement, lifecycle actions, recovery, and navigation share one lock.
  const performLifecycle = async (
    action: OrganizeLifecycleAction,
    target: OrganizeNodeRef,
    onCommitted?: () => void,
  ) => {
    const before = confirmed.current;
    const node = before?.nodes.find(
      (item) => item.id === target.id && item.nodeType === target.nodeType,
    );
    const availability = organizeLifecycleAvailability(before, target, action);
    if (!api || !before || !node || needsRefresh || !availability.enabled) {
      throw new Error(
        needsRefresh
          ? "This item is no longer available for that action. Refresh and try again."
          : availability.reason,
      );
    }
    attempted.current = {
      lifecycle: { action, target },
      version: before.version,
    };
    await api[action](target);
    // A confirmed commit is never retried, even if its subsequent refresh fails.
    attempted.current = undefined;
    if (!mounted.current) return;
    // Reflect a known commit while canonical metadata is being recovered.
    // Its old version cannot be submitted: the shared controller stays blocked.
    setSnapshot({
      ...before,
      nodes:
        action === "delete"
          ? before.nodes.filter((item) => item.id !== target.id)
          : before.nodes.map((item) =>
              item.id === target.id
                ? { ...item, isActive: action === "unarchive" }
                : item,
            ),
    });
    onSaved();
    onCommitted?.();
    const siblings = organizeDisplayRows(before.nodes, true).filter(
      (item) => (item.parentId ?? null) === node.parentId,
    );
    const index = siblings.findIndex((item) => item.id === target.id);
    const neighbors: string[] = [];
    for (let distance = 1; distance < siblings.length; distance++) {
      const after = siblings[index + distance];
      const previous = siblings[index - distance];
      if (after) neighbors.push(after.id);
      if (previous) neighbors.push(previous.id);
    }
    setRevealIds([target.id, ...(node.parentId ? [node.parentId] : [])]);
    setFocusFallbackIds(neighbors);
    setMessage(
      `${node.name} ${action === "archive" ? "archived" : action === "unarchive" ? "unarchived" : "deleted"}.`,
    );
    await refresh();
  };
  const isRetryValid = () => {
    const attempt = attempted.current;
    return (
      !!attempt &&
      attempt.version === confirmed.current?.version &&
      (!attempt.lifecycle ||
        organizeLifecycleAvailability(
          confirmed.current,
          attempt.lifecycle.target,
          attempt.lifecycle.action,
        ).enabled)
    );
  };
  const retry = () => {
    if (!submitState.submissionError?.isBusy || !isRetryValid()) return;
    if (attempted.current?.move) void saveMove(attempted.current.move);
    else if (attempted.current?.lifecycle) {
      const { action, target } = attempted.current.lifecycle;
      void runSubmit(() => performLifecycle(action, target));
    }
  };
  return {
    load,
    reset,
    snapshot,
    loading,
    loadError,
    refresh,
    performLifecycle,
    saveMove,
    pending,
    blocked: pending || needsRefresh || loading || !snapshot,
    message,
    revealIds,
    focusFallbackIds,
    submitState,
    retry,
    retryDisabled: !isRetryValid(),
  };
}

export type Organizer = ReturnType<typeof useOrganizer>;
