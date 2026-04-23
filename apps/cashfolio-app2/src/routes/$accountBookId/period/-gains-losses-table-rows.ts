import type { GainsLossesBreakdownNode } from "./-gains-losses-breakdown-types";

export const GAINS_LOSSES_TOTAL_FOOTER_ROW_ID = "__gains_losses_total_footer__";

export type GainsLossesTableRow = {
  id: string;
  parentId: string | undefined;
  name: string;
  realizedGainLoss: number;
  unrealizedGainLoss: number;
  totalGainLoss: number;
};

export type GainsLossesTotalFooterRow = {
  id: typeof GAINS_LOSSES_TOTAL_FOOTER_ROW_ID;
  rowType: "gainsLossesTotalFooter";
  name: "Total";
  realizedGainLoss: number;
  unrealizedGainLoss: number;
  totalGainLoss: number;
};

export type GainsLossesGridRow =
  | GainsLossesTableRow
  | GainsLossesTotalFooterRow;

export function flattenGainsLossesHierarchyRows(
  hierarchy: GainsLossesBreakdownNode[],
): GainsLossesTableRow[] {
  const rows: GainsLossesTableRow[] = [];

  const appendRows = (
    nodes: GainsLossesBreakdownNode[],
    parentId: string | undefined,
  ) => {
    for (const node of nodes) {
      rows.push({
        id: node.id,
        parentId,
        name: node.label,
        realizedGainLoss: node.realizedGainLoss,
        unrealizedGainLoss: node.unrealizedGainLoss,
        totalGainLoss: node.totalGainLoss,
      });

      if (node.children.length > 0) {
        appendRows(node.children, node.id);
      }
    }
  };

  appendRows(hierarchy, undefined);
  return rows;
}

export function sumTopLevelRealizedGainLoss(
  hierarchy: GainsLossesBreakdownNode[],
): number {
  return hierarchy.reduce((sum, node) => sum + node.realizedGainLoss, 0);
}

export function sumTopLevelUnrealizedGainLoss(
  hierarchy: GainsLossesBreakdownNode[],
): number {
  return hierarchy.reduce((sum, node) => sum + node.unrealizedGainLoss, 0);
}

export function sumTopLevelTotalGainLoss(
  hierarchy: GainsLossesBreakdownNode[],
): number {
  return hierarchy.reduce((sum, node) => sum + node.totalGainLoss, 0);
}
