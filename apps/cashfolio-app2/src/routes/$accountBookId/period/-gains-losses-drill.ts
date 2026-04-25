import {
  clampDrillTreePath,
  getDrillTreeState,
  isDrillTreeNodeDrillable,
} from "./-breakdown-drill";
import type { GainsLossesBreakdownNode } from "./-gains-losses-breakdown-types";
import {
  GAINS_LOSSES_TOTAL_FOOTER_ROW_ID,
  type GainsLossesGridRow,
} from "./-gains-losses-table-rows";

const EXPLICIT_UNIT_TYPE_ROW_ID = "unit-type:explicit";
const EXPLICIT_ACCOUNT_ROW_ID_PREFIX = "explicit-account:";

export function isGainsLossesNodeDrillable(node: GainsLossesBreakdownNode) {
  return isDrillTreeNodeDrillable(node);
}

export function clampGainsLossesPath(args: {
  hierarchy: GainsLossesBreakdownNode[];
  path: string[];
}): string[] {
  return clampDrillTreePath({
    hierarchy: args.hierarchy,
    path: args.path,
    isNodeDrillable: isGainsLossesNodeDrillable,
  });
}

export function getGainsLossesDrillState(args: {
  hierarchy: GainsLossesBreakdownNode[];
  path: string[];
  rootLabel: string;
}) {
  return getDrillTreeState({
    hierarchy: args.hierarchy,
    path: args.path,
    rootLabel: args.rootLabel,
    isNodeDrillable: isGainsLossesNodeDrillable,
  });
}

export function isExplicitGainLossDrillRow(
  row: GainsLossesGridRow | undefined,
): boolean {
  if (!row || row.id === GAINS_LOSSES_TOTAL_FOOTER_ROW_ID) {
    return false;
  }

  return (
    row.id === EXPLICIT_UNIT_TYPE_ROW_ID ||
    row.id.startsWith(EXPLICIT_ACCOUNT_ROW_ID_PREFIX)
  );
}
