import { useCallback, useEffect, useRef, useState } from "react";
import type {
  GridApi,
  IRowNode,
  IsRowValidDropPositionParams,
} from "ag-grid-enterprise";
import { planOrganizeMove } from "@/shared/hierarchy-organize/move";
import {
  normalizeOrganizeSelection,
  type OrganizeDisplayRow,
} from "@/shared/hierarchy-organize/tree";
import type {
  OrganizeMove,
  OrganizeNode,
  OrganizeNodeRef,
} from "@/shared/hierarchy-organize/types";
import { dragMoveSummary } from "./move-summary";
import { canContainChildren } from "@/shared/hierarchy-organize/types";

export function dragMove(
  items: OrganizeNodeRef[],
  target: OrganizeDisplayRow,
  position: "above" | "inside" | "below",
): OrganizeMove {
  if (position === "inside") {
    if (!canContainChildren(target))
      throw new Error("Accounts cannot contain other items.");
    return { items, parentId: target.id, placement: "last" };
  }
  return {
    items,
    parentId: target.parentId ?? null,
    placement: position === "above" ? "before" : "after",
    anchorId: target.id,
  };
}

export function useOrganizeDrag({
  nodes,
  api,
  blocked,
  saveMove,
}: {
  nodes: OrganizeNode[];
  api?: GridApi<OrganizeDisplayRow>;
  blocked: boolean;
  saveMove: (move: OrganizeMove) => Promise<boolean | undefined>;
}) {
  const proposed = useRef<OrganizeMove | undefined>(undefined);
  const cancelled = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [hint, setHint] = useState("");
  const hintRef = useRef("");
  const previewCache = useRef<
    { nodes: OrganizeNode[]; key: string; message: string } | undefined
  >(undefined);
  const hover = useRef<
    { id: string; timer: ReturnType<typeof setTimeout> } | undefined
  >(undefined);
  const clearHover = useCallback(() => {
    clearTimeout(hover.current?.timer);
    hover.current = undefined;
  }, []);
  const showHint = useCallback((value: string) => {
    hintRef.current = value;
    setHint(value);
  }, []);
  const itemsFor = useCallback(
    (source: IRowNode<OrganizeDisplayRow>): OrganizeNodeRef[] => {
      const selected = source.isSelected()
        ? (api?.getSelectedRows() ?? [])
        : source.data
          ? [source.data]
          : [];
      return normalizeOrganizeSelection(nodes, selected);
    },
    [api, nodes],
  );
  const preview = useCallback(
    (move: OrganizeMove) => {
      if (blocked || cancelled.current)
        throw new Error("Movement is unavailable while saving or refreshing.");
      const key = JSON.stringify(move);
      if (
        previewCache.current?.nodes === nodes &&
        previewCache.current.key === key
      ) {
        proposed.current = move;
        showHint(previewCache.current.message);
        return;
      }
      const next = planOrganizeMove(nodes, move);
      proposed.current = move;
      const message = dragMoveSummary(nodes, next, move);
      previewCache.current = { nodes, key, message };
      showHint(message);
    },
    [blocked, nodes, showHint],
  );
  const start = useCallback(() => {
    setDragging(!blocked);
    cancelled.current = blocked;
    proposed.current = undefined;
  }, [blocked]);
  const cancel = useCallback(() => {
    setDragging(false);
    cancelled.current = true;
    proposed.current = undefined;
    clearHover();
    api?.setRowDropPositionIndicator(null);
    showHint("");
  }, [api, clearHover, showHint]);
  const leave = useCallback(() => {
    proposed.current = undefined;
    clearHover();
    api?.setRowDropPositionIndicator(null);
    showHint("");
  }, [api, clearHover, showHint]);
  const finish = useCallback(() => {
    setDragging(false);
    const move = proposed.current;
    leave();
    if (move && !cancelled.current && !blocked) void saveMove(move);
  }, [blocked, leave, saveMove]);
  const validateDrop = useCallback(
    (params: IsRowValidDropPositionParams<OrganizeDisplayRow>) => {
      if (!blocked && !cancelled.current) setDragging(true);
      const target = params.overNode;
      const row = target?.data;
      if (!row) {
        proposed.current = undefined;
        return false;
      }
      if (hover.current?.id !== row.id) {
        clearHover();
        if (target.group && !target.expanded)
          hover.current = {
            id: row.id,
            timer: setTimeout(() => target.setExpanded(true), 500),
          };
      }
      const ratio =
        (params.y - (target.rowTop ?? 0)) / (target.rowHeight || 38);
      const position: "above" | "inside" | "below" =
        canContainChildren(row) && ratio >= 0.25 && ratio <= 0.75
          ? "inside"
          : ratio < 0.5
            ? "above"
            : "below";
      try {
        preview(dragMove(itemsFor(params.source), row, position));
        return {
          allowed: true,
          highlight: true,
          target,
          position,
          newParent: position === "inside" ? target : target.parent,
          changed: true,
        };
      } catch (error) {
        proposed.current = undefined;
        showHint(
          error instanceof Error ? error.message : "Invalid destination.",
        );
        return false;
      }
    },
    [blocked, clearHover, itemsFor, preview, showHint],
  );
  const cancelRef = useRef(cancel);
  cancelRef.current = cancel;
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancelRef.current();
    };
    document.addEventListener("keydown", escape);
    const released = () => setDragging(false);
    document.addEventListener("pointerup", released);
    document.addEventListener("mouseup", released);
    return () => {
      document.removeEventListener("keydown", escape);
      document.removeEventListener("pointerup", released);
      document.removeEventListener("mouseup", released);
      clearTimeout(hover.current?.timer);
    };
  }, []);
  const dragText = useCallback(
    () => hintRef.current || "Move selected items",
    [],
  );
  return {
    dragging,
    hint,
    start,
    cancel,
    leave,
    finish,
    validateDrop,
    dragText,
  };
}
