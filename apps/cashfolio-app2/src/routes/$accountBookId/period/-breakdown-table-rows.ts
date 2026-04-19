import type { BreakdownNodeKind } from "@/shared/breakdown-hierarchy";
import type { BreakdownHierarchyNode } from "./-breakdown-drill";

export type BreakdownTableRow = {
  id: string;
  parentId: string | undefined;
  name: string;
  kind: BreakdownNodeKind;
  value: number;
};

export function flattenBreakdownHierarchyRows(
  hierarchy: BreakdownHierarchyNode[],
): BreakdownTableRow[] {
  const rows: BreakdownTableRow[] = [];

  const appendRows = (
    nodes: BreakdownHierarchyNode[],
    parentId: string | undefined,
  ) => {
    for (const node of nodes) {
      rows.push({
        id: node.id,
        parentId,
        name: node.label,
        kind: node.kind,
        value: node.amount,
      });

      if (node.children.length > 0) {
        appendRows(node.children, node.id);
      }
    }
  };

  appendRows(hierarchy, undefined);
  return rows;
}
