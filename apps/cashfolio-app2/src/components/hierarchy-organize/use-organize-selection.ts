import { useCallback, useEffect, useMemo, useState } from "react";
import type { GridApi, SelectionChangedEvent } from "ag-grid-enterprise";
import {
  normalizeOrganizeSelection,
  organizeDisplayRows,
  type OrganizeDisplayRow,
} from "@/shared/hierarchy-organize/tree";
import type {
  OrganizeNode,
  OrganizeNodeRef,
} from "@/shared/hierarchy-organize/types";

export function useOrganizeSelection(
  nodes: OrganizeNode[],
  api?: GridApi<OrganizeDisplayRow>,
  controlledShowArchived?: boolean,
) {
  const [localShowArchived, setShowArchived] = useState(false);
  const showArchived = controlledShowArchived ?? localShowArchived;
  const [selectionNotice, setSelectionNotice] = useState("");
  const [selected, setSelected] = useState<OrganizeNodeRef[]>([]);
  const rows = useMemo(
    () => organizeDisplayRows(nodes, showArchived),
    [nodes, showArchived],
  );
  useEffect(() => {
    const visible = new Set(rows.map((row) => row.id));
    const retained = selected.filter((item) => visible.has(item.id));
    if (retained.length !== selected.length) {
      setSelected(retained);
      setSelectionNotice(
        `${selected.length - retained.length} unavailable or hidden ${selected.length - retained.length === 1 ? "item was" : "items were"} deselected.`,
      );
    }
  }, [rows, selected]);
  const roots = useMemo(
    () =>
      normalizeOrganizeSelection(
        nodes,
        selected.filter((item) => nodes.some((node) => node.id === item.id)),
      ),
    [nodes, selected],
  );
  const onSelectionChanged = useCallback(
    ({ api }: SelectionChangedEvent<OrganizeDisplayRow>) =>
      setSelected(api.getSelectedRows()),
    [],
  );
  const clearSelection = () => {
    api?.deselectAll();
    setSelected([]);
  };
  const changeArchivedVisibility = (value: boolean) => {
    if (!value) {
      const hidden = selected.filter(
        (item) => nodes.find((node) => node.id === item.id)?.isActive === false,
      );
      for (const item of hidden) api?.getRowNode(item.id)?.setSelected(false);
      setSelected(
        selected.filter((item) => !hidden.some((node) => node.id === item.id)),
      );
      setSelectionNotice(
        hidden.length
          ? `${hidden.length} hidden archived ${hidden.length === 1 ? "item was" : "items were"} deselected.`
          : "",
      );
    } else setSelectionNotice("");
    setShowArchived(value);
  };
  return {
    rows,
    selected,
    roots,
    selectionNotice,
    showArchived,
    onSelectionChanged,
    clearSelection,
    changeArchivedVisibility,
  };
}
