import { useCallback, useRef } from "react";
import type {
  RowClassParams,
  RowDragEndEvent,
  RowDragLeaveEvent,
  RowDragMoveEvent,
} from "ag-grid-enterprise";
import { reorderAccountTreeItems } from "../server/accounts";

type DnDRow = {
  id: string;
  parentId?: string | null;
  nodeType: "account" | "accountGroup";
  sortOrder?: number | null;
};

export function useAccountTreeDnD<TRow extends DnDRow>({
  treeData,
  tab,
  accountBookId,
  router,
}: {
  treeData: Record<string, TRow[]>;
  tab: string;
  accountBookId: string;
  router: { invalidate: () => void };
}) {
  const dragIndicatorRef = useRef<{
    overId: string;
    position: "above" | "below";
  } | null>(null);

  const handleRowDragEnd = useCallback(
    async (event: RowDragEndEvent<TRow>) => {
      dragIndicatorRef.current = null;
      const draggedData = event.node.data;
      const overData = event.overNode?.data;
      if (!draggedData || !overData || draggedData.id === overData.id) return;

      const draggedParentId = draggedData.parentId ?? null;
      const overParentId = overData.parentId ?? null;
      if (draggedParentId !== overParentId) return;

      const siblings = treeData[tab].filter(
        (row) => (row.parentId ?? null) === draggedParentId,
      );

      const draggedIndex = siblings.findIndex((r) => r.id === draggedData.id);
      const overIndex = siblings.findIndex((r) => r.id === overData.id);
      if (draggedIndex === -1 || overIndex === -1 || draggedIndex === overIndex)
        return;

      const newSiblings = [...siblings];
      newSiblings.splice(draggedIndex, 1);
      const newOverIndex = overIndex > draggedIndex ? overIndex - 1 : overIndex;
      const insertAt =
        draggedIndex < overIndex ? newOverIndex + 1 : newOverIndex;
      newSiblings.splice(insertAt, 0, draggedData);

      await reorderAccountTreeItems({
        data: {
          accountBookId,
          updates: newSiblings.map((row, i) => ({
            id: row.id,
            nodeType: row.nodeType,
            sortOrder: i,
          })),
        },
      });
      router.invalidate();

      dragIndicatorRef.current = null;
      event.api.redrawRows({ rowNodes: [event.overNode!] });
    },
    [treeData, tab, accountBookId, router],
  );

  const getRowClass = useCallback((params: RowClassParams<TRow>) => {
    if (!dragIndicatorRef.current || !params.data) return undefined;
    if (params.data.id === dragIndicatorRef.current.overId) {
      return dragIndicatorRef.current.position === "above"
        ? "drag-indicator-above"
        : "drag-indicator-below";
    }
    return undefined;
  }, []);

  const handleRowDragMove = useCallback(
    (event: RowDragMoveEvent<TRow>) => {
      const draggedData = event.node.data;
      const overNode = event.overNode;
      const overData = overNode?.data;
      const prevOverId = dragIndicatorRef.current?.overId;

      if (!draggedData || !overData || draggedData.id === overData.id) {
        dragIndicatorRef.current = null;
        if (prevOverId) {
          const prevNode = event.api.getRowNode(prevOverId);
          if (prevNode) event.api.redrawRows({ rowNodes: [prevNode] });
        }
        return;
      }

      const draggedParentId = draggedData.parentId ?? null;
      const overParentId = overData.parentId ?? null;
      if (draggedParentId !== overParentId) {
        dragIndicatorRef.current = null;
        if (prevOverId) {
          const prevNode = event.api.getRowNode(prevOverId);
          if (prevNode) event.api.redrawRows({ rowNodes: [prevNode] });
        }
        return;
      }

      const siblings = treeData[tab].filter(
        (row) => (row.parentId ?? null) === draggedParentId,
      );
      const draggedIndex = siblings.findIndex((r) => r.id === draggedData.id);
      const overIndex = siblings.findIndex((r) => r.id === overData.id);

      dragIndicatorRef.current = {
        overId: overData.id,
        position: draggedIndex < overIndex ? "below" : "above",
      };

      const nodesToRedraw = [];
      if (prevOverId && prevOverId !== overData.id) {
        const prevNode = event.api.getRowNode(prevOverId);
        if (prevNode) nodesToRedraw.push(prevNode);
      }
      if (overNode) nodesToRedraw.push(overNode);
      if (nodesToRedraw.length > 0) {
        event.api.redrawRows({ rowNodes: nodesToRedraw });
      }
    },
    [treeData, tab],
  );

  const handleRowDragLeave = useCallback(
    (event: RowDragLeaveEvent<TRow>) => {
      const prevOverId = dragIndicatorRef.current?.overId;
      dragIndicatorRef.current = null;
      if (prevOverId) {
        const prevNode = event.api.getRowNode(prevOverId);
        if (prevNode) event.api.redrawRows({ rowNodes: [prevNode] });
      }
    },
    [],
  );

  return {
    dragIndicatorRef,
    handleRowDragEnd,
    handleRowDragMove,
    handleRowDragLeave,
    getRowClass,
  };
}
