import type { BreakdownNodeKind } from "@/shared/breakdown-hierarchy";
import type { BreakdownHierarchyNode } from "./-breakdown-drill";

export const BREAKDOWN_TOTAL_FOOTER_ROW_ID = "__breakdown_total_footer__";

type ExactValueByField = Record<string, number | null | undefined>;

export type BreakdownTableRow = {
  id: string;
  parentId: string | undefined;
  name: string;
  kind: BreakdownNodeKind;
  value: number;
  __exactByField?: ExactValueByField;
};

export type BreakdownTotalFooterRow = {
  id: typeof BREAKDOWN_TOTAL_FOOTER_ROW_ID;
  rowType: "breakdownTotalFooter";
  name: "Total";
  value: number;
  __exactByField?: ExactValueByField;
};

export type BreakdownGridRow = BreakdownTableRow | BreakdownTotalFooterRow;

export function isBreakdownTotalFooterRow(
  row: BreakdownGridRow | undefined,
): row is BreakdownTotalFooterRow {
  return !!row && "rowType" in row && row.rowType === "breakdownTotalFooter";
}

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
        __exactByField: {
          value: node.rawAmount ?? node.amount,
        },
      });

      if (node.children.length > 0) {
        appendRows(node.children, node.id);
      }
    }
  };

  appendRows(hierarchy, undefined);
  return rows;
}

export function sumTopLevelBreakdownHierarchyAmount(
  hierarchy: BreakdownHierarchyNode[],
): number {
  return hierarchy.reduce((sum, node) => sum + node.amount, 0);
}

export function sumTopLevelBreakdownHierarchyRawAmount(
  hierarchy: BreakdownHierarchyNode[],
): number {
  return hierarchy.reduce(
    (sum, node) => sum + (node.rawAmount ?? node.amount),
    0,
  );
}
