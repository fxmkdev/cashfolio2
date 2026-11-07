import { useCallback, useEffect, useRef, useState } from "react";
import {
  committedLifecycleView,
  organizeLifecycleAvailability,
} from "./lifecycle";
import { useDialogSubmitState } from "@/hooks/use-dialog-submit-state";
import { getAccountConstraintMessage } from "@/shared/account-presentation";
import { planOrganizeMove } from "@/shared/hierarchy-organize/move";
import type {
  OrganizeMove,
  OrganizeMoveResult,
  OrganizeSnapshot,
  OrganizeNodeRef,
  OrganizeLifecycleAction,
} from "@/shared/hierarchy-organize/types";

export type OrganizerApi = {
  kind?: "accounts" | "categories" | "assetClasses";
  load: () => Promise<OrganizeSnapshot>;
  move: (move: OrganizeMove, version: string) => Promise<OrganizeMoveResult>;
  archive?: (target: OrganizeNodeRef) => Promise<unknown>;
  unarchive?: (target: OrganizeNodeRef) => Promise<unknown>;
  delete: (
    target: OrganizeNodeRef,
    replacementId?: string | null,
  ) => Promise<unknown>;
};

export function useOrganizer(
  onSaved: () => void,
  apiOverride?: OrganizerApi,
  autoLoad = true,
  refreshMetadata?: () => Promise<void>,
) {
  const api = useRef(apiOverride).current;
  const metadata = useRef(refreshMetadata);
  metadata.current = refreshMetadata;
  const [snapshot, setSnapshot] = useState<OrganizeSnapshot>();
  const confirmed = useRef<OrganizeSnapshot | undefined>(undefined);
  const [loadError, setLoadError] = useState<string>();
  const [loading, setLoading] = useState(autoLoad);
  const [message, setMessage] = useState("");
  const [revealIds, setRevealIds] = useState<string[]>([]);
  const [focusFallbackIds, setFocusFallbackIds] = useState<string[]>([]);
  const committedEdit = useRef<
    { ids: Set<string>; target?: OrganizeNodeRef } | undefined
  >(undefined);
  const mounted = useRef(true);
  const generation = useRef(0);
  const loadInFlight = useRef<number | undefined>(undefined);
  const attempted = useRef<
    | {
        move?: OrganizeMove;
        lifecycle?: {
          action: OrganizeLifecycleAction;
          target: OrganizeNodeRef;
          replacementId?: string | null;
        };
        version: string;
      }
    | undefined
  >(undefined);
  const refresh = useCallback(async () => {
    if (!api) throw new Error("Organize is unavailable.");
    const current = generation.current;
    const next = await api.load();
    await metadata.current?.();
    if (!mounted.current || current !== generation.current) return;
    confirmed.current = next;
    setSnapshot(next);
    setLoadError(undefined);
    const edit = committedEdit.current;
    if (edit) {
      setRevealIds(
        edit.target
          ? [edit.target.id]
          : next.nodes
              .filter((node) => !edit.ids.has(node.id))
              .map((node) => node.id),
      );
      setFocusFallbackIds([]);
      committedEdit.current = undefined;
    }
  }, [api]);
  const formatErrorMessage = useCallback(
    (message: string) =>
      getAccountConstraintMessage(
        message,
        api?.kind === "categories" ? "categories" : "accounts",
      ) ?? message,
    [api],
  );
  const submitState = useDialogSubmitState({
    captureErrors: true,
    onRefreshConstraints: refresh,
    formatErrorMessage,
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
        setLoadError("Could not load the hierarchy.");
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
    committedEdit.current = undefined;
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
        const next = planOrganizeMove(before.nodes, move);
        if (next === before.nodes) {
          setMessage("The items are already in that position.");
          return;
        }
        setSnapshot({ ...before, nodes: next });
        let committed = false;
        try {
          const result = await api.move(move, before.version);
          committed = true;
          attempted.current = undefined;
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
          await metadata.current?.();
        } catch (error) {
          if (mounted.current && !committed) setSnapshot(before);
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
    replacementId?: string | null,
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
      lifecycle: { action, target, replacementId },
      version: before.version,
    };
    const operation = api[action];
    if (!operation)
      throw new Error("This action is unavailable for this hierarchy.");
    await operation(target, replacementId);
    // A confirmed commit is never retried, even if its subsequent refresh fails.
    attempted.current = undefined;
    if (!mounted.current) return;
    const committed = committedLifecycleView(before, action, node);
    // This version stays blocked until canonical metadata is recovered.
    setSnapshot(committed.snapshot);
    setRevealIds(committed.revealIds);
    setFocusFallbackIds(committed.focusFallbackIds);
    setMessage(committed.message);
    onSaved();
    onCommitted?.();
    await refresh();
  };
  // Editor dialogs own runSubmit. Clear retry intent immediately after commit;
  // a failed metadata read must never replay a successful create or edit.
  const performEdit = async (
    operation: () => Promise<unknown>,
    target?: OrganizeNodeRef,
    onCommitted?: () => void,
  ) => {
    const before = confirmed.current;
    if (!before || needsRefresh)
      throw new Error("Refresh the hierarchy before saving.");
    attempted.current = undefined;
    await operation();
    committedEdit.current = {
      ids: new Set(before.nodes.map((node) => node.id)),
      target,
    };
    onCommitted?.();
    setMessage("Changes saved.");
    onSaved();
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
      const { action, target, replacementId } = attempted.current.lifecycle;
      void runSubmit(() =>
        performLifecycle(action, target, undefined, replacementId),
      );
    }
  };
  return {
    kind: api?.kind ?? "accounts",
    load,
    reset,
    snapshot,
    loading,
    loadError,
    refresh,
    performLifecycle,
    performEdit,
    saveMove,
    pending,
    blocked: pending || needsRefresh || loading || !snapshot,
    message,
    revealIds,
    focusFallbackIds,
    submitState,
    retry,
    retryDisabled: !isRetryValid(),
    formatErrorMessage,
  };
}

export type Organizer = ReturnType<typeof useOrganizer>;
