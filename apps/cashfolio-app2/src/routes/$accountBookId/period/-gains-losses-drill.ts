import {
  clampDrillTreePath,
  getDrillTreeState,
  isDrillTreeNodeDrillable,
} from "./-breakdown-drill";
import type { GainsLossesBreakdownNode } from "./-gains-losses-breakdown-types";

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
