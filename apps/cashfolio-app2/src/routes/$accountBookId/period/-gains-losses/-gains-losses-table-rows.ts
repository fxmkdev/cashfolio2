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

const UNIT_ACCOUNT_ROW_ID_PREFIX = "unit-account:";
const UNIT_ROW_ID_PREFIX = "unit:";

export function parseGainsLossesUnitAccountId(args: {
  rowId: string;
  parentId: string | undefined;
}): string | null {
  if (!args.rowId.startsWith(UNIT_ACCOUNT_ROW_ID_PREFIX)) {
    return null;
  }
  if (!args.parentId || !args.parentId.startsWith(UNIT_ROW_ID_PREFIX)) {
    return null;
  }

  const parentUnitId = args.parentId.slice(UNIT_ROW_ID_PREFIX.length);
  const expectedPrefix = `${UNIT_ACCOUNT_ROW_ID_PREFIX}${parentUnitId}:`;
  if (!args.rowId.startsWith(expectedPrefix)) {
    return null;
  }

  const accountId = args.rowId.slice(expectedPrefix.length).trim();
  return accountId.length > 0 ? accountId : null;
}

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
