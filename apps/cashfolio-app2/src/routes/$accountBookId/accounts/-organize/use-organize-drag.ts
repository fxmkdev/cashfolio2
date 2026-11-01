import { useEffect, useRef, useState } from "react";
import type {
  GridApi,
  IRowNode,
  IsRowValidDropPositionParams,
  RowDragEvent,
  RowDropZoneParams,
} from "ag-grid-enterprise";
import { planAccountMove } from "@/shared/account-organize/move";
import {
  normalizeOrganizeSelection,
  organizePath,
  type OrganizeDisplayRow,
} from "@/shared/account-organize/tree";
import type {
  OrganizeMove,
  OrganizeNode,
  OrganizeNodeRef,
} from "@/shared/account-organize/types";
import { moveSummary } from "./move-dialog";

export function dragMove(
  items: OrganizeNodeRef[],
  target: OrganizeDisplayRow,
  position: "above" | "inside" | "below",
): OrganizeMove {
  if (target.isVirtualArchivedGroup)
    throw new Error(
      "Archived is a display section. Choose a real group or Top Level.",
    );
  if (position === "inside") {
    if (target.nodeType !== "accountGroup")
      throw new Error("Accounts cannot contain other items.");
    return { items, parentId: target.id, placement: "last" };
  }
  return {
    items,
    parentId: target.persistedParentId,
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
  const rootRef = useRef<HTMLDivElement>(null);
  const proposed = useRef<OrganizeMove | undefined>(undefined);
  const cancelled = useRef(false);
  const [hint, setHint] = useState("");
  const hintRef = useRef("");
  const previewCache = useRef<
    { nodes: OrganizeNode[]; key: string; message: string } | undefined
  >(undefined);
  const hover = useRef<
    { id: string; timer: ReturnType<typeof setTimeout> } | undefined
  >(undefined);
  const clearHover = () => {
    clearTimeout(hover.current?.timer);
    hover.current = undefined;
  };
  const showHint = (value: string) => {
    hintRef.current = value;
    setHint(value);
  };
  const itemsFor = (
    source: IRowNode<OrganizeDisplayRow>,
  ): OrganizeNodeRef[] => {
    const selected = source.isSelected()
      ? (api?.getSelectedRows() ?? [])
      : source.data
        ? [source.data]
        : [];
    return normalizeOrganizeSelection(
      nodes,
      selected.filter((row) => !row.isVirtualArchivedGroup),
    );
  };
  const preview = (move: OrganizeMove) => {
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
    const next = planAccountMove(nodes, move);
    const destination = move.parentId
      ? organizePath(nodes, move.parentId)
      : "Top Level";
    const relative = move.anchorId
      ? `${move.placement} ${nodes.find((node) => node.id === move.anchorId)?.name} in `
      : "into ";
    proposed.current = move;
    const message =
      `Move ${move.items.length} ${move.items.length === 1 ? "item" : "items"} ${relative}${destination}. ${moveSummary(nodes, next)}`.trim();
    previewCache.current = { nodes, key, message };
    showHint(message);
  };
  const start = () => {
    cancelled.current = false;
    proposed.current = undefined;
  };
  const cancel = () => {
    cancelled.current = true;
    proposed.current = undefined;
    clearHover();
    api?.setRowDropPositionIndicator(null);
    showHint("");
  };
  const leave = () => {
    proposed.current = undefined;
    clearHover();
    api?.setRowDropPositionIndicator(null);
    showHint("");
  };
  const finish = () => {
    const move = proposed.current;
    leave();
    if (move && !cancelled.current && !blocked) void saveMove(move);
  };
  const validateDrop = (
    params: IsRowValidDropPositionParams<OrganizeDisplayRow>,
  ) => {
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
    const ratio = (params.y - (target.rowTop ?? 0)) / (target.rowHeight || 38);
    const position: "above" | "inside" | "below" =
      row.nodeType === "accountGroup" && ratio >= 0.25 && ratio <= 0.75
        ? "inside"
        : ratio < 0.5
          ? "above"
          : "below";
    try {
      preview(dragMove(itemsFor(params.source), row, position));
      return { allowed: true, highlight: true, target, position };
    } catch (error) {
      proposed.current = undefined;
      showHint(error instanceof Error ? error.message : "Invalid destination.");
      return false;
    }
  };
  const handlers = useRef({ start, cancel, leave, finish, preview, itemsFor });
  handlers.current = { start, cancel, leave, finish, preview, itemsFor };
  useEffect(() => {
    if (!api || !rootRef.current) return;
    const showRoot = (event: RowDragEvent<OrganizeDisplayRow>) => {
      try {
        handlers.current.preview({
          items: handlers.current.itemsFor(event.node),
          parentId: null,
          placement: "last",
        });
      } catch (error) {
        proposed.current = undefined;
        const value =
          error instanceof Error ? error.message : "Invalid destination.";
        hintRef.current = value;
        setHint(value);
      }
    };
    const dropZone: RowDropZoneParams = {
      getContainer: () => rootRef.current!,
      onDragEnter: showRoot,
      onDragging: showRoot,
      onDragLeave: () => handlers.current.leave(),
      onDragStop: () => handlers.current.finish(),
      onDragCancel: () => handlers.current.cancel(),
    };
    api.addRowDropZone(dropZone);
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") handlers.current.cancel();
    };
    document.addEventListener("keydown", escape);
    return () => {
      if (!api.isDestroyed()) api.removeRowDropZone(dropZone);
      document.removeEventListener("keydown", escape);
      clearTimeout(hover.current?.timer);
    };
  }, [api]);
  return {
    rootRef,
    hint,
    start,
    cancel,
    leave,
    finish,
    validateDrop,
    dragText: () => hintRef.current || "Move selected items",
  };
}
