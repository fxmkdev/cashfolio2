import {
  clampDrillTreePath,
  getDrillTreeState,
  isDrillTreeNodeDrillable,
} from "../-breakdown/-breakdown-drill";
import type { GainsLossesBreakdownNode } from "./-gains-losses-breakdown-types";
export function isGainsLossesNodeDrillable(node: GainsLossesBreakdownNode) {
  return isDrillTreeNodeDrillable(node);
}

export function clampGainsLossesPath(args: {
  hierarchy: GainsLossesBreakdownNode[];
  path: string[];
}): string[] {
  const selectedClass = args.path.findLast((id) =>
    id.startsWith("asset-class:"),
  );
  if (selectedClass) {
    const findPath = (
      nodes: GainsLossesBreakdownNode[],
      path: string[],
    ): string[] | undefined => {
      for (const node of nodes) {
        const next = [...path, node.id];
        if (node.id === selectedClass) return next;
        const found = findPath(node.children, next);
        if (found) return found;
      }
    };
    const currentPath = findPath(args.hierarchy, []);
    if (!currentPath) return [];
    return clampDrillTreePath({
      hierarchy: args.hierarchy,
      path: currentPath,
      isNodeDrillable: isGainsLossesNodeDrillable,
    });
  }
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
    path: clampGainsLossesPath(args),
    rootLabel: args.rootLabel,
    isNodeDrillable: isGainsLossesNodeDrillable,
  });
}
