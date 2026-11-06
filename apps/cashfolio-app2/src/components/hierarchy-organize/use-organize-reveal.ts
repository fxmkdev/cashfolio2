import { useCallback, useEffect, type RefObject } from "react";
import type { GridApi } from "ag-grid-enterprise";
import type { OrganizeNode } from "@/shared/hierarchy-organize/types";
import type { OrganizeDisplayRow } from "@/shared/hierarchy-organize/tree";
import type { Organizer } from "./use-organizer";

export function useOrganizeReveal({
  api,
  nodes,
  rows,
  organizer,
  region,
}: {
  api?: GridApi<OrganizeDisplayRow>;
  nodes: OrganizeNode[];
  rows: OrganizeDisplayRow[];
  organizer: Pick<Organizer, "revealIds" | "focusFallbackIds">;
  region: RefObject<HTMLElement | null>;
}) {
  const reveal = useCallback(
    (id: string, focus: boolean) => {
      let node = api?.getRowNode(id);
      let current = nodes.find((item) => item.id === id);
      while (!node && current?.parentId) {
        current = nodes.find((item) => item.id === current?.parentId);
        if (current) node = api?.getRowNode(current.id);
      }
      if (!api || !node) return false;
      let parent = node.parent;
      while (parent && parent.level >= 0) {
        parent.setExpanded(true, undefined, true);
        parent = parent.parent;
      }
      api.ensureNodeVisible(node, "middle");
      if (focus && node.rowIndex !== null)
        api.setFocusedCell(node.rowIndex, "ag-Grid-AutoColumn");
      return true;
    },
    [api, nodes],
  );
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      for (const id of organizer.revealIds) reveal(id, false);
      if (
        organizer.revealIds.length &&
        !organizer.revealIds.some((id) => reveal(id, true)) &&
        !organizer.focusFallbackIds.some((id) => reveal(id, true))
      )
        region.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [organizer.focusFallbackIds, organizer.revealIds, region, rows, reveal]);
}
