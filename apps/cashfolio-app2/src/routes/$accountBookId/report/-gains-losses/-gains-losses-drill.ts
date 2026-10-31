import {
  clampDrillTreePath,
  getDrillTreeState,
  isDrillTreeNodeDrillable,
} from "../-breakdown/-breakdown-drill";
import type { GainsLossesBreakdownNode } from "./-gains-losses-breakdown-types";
export function isGainsLossesNodeDrillable(node: GainsLossesBreakdownNode) {
  return isDrillTreeNodeDrillable(node);
}

function findCurrentPath(
  nodes: GainsLossesBreakdownNode[],
  targetId: string,
  ancestors: string[] = [],
): string[] | undefined {
  for (const node of nodes) {
    const currentPath = [...ancestors, node.id];
    if (node.id === targetId) return currentPath;
    const descendantPath = findCurrentPath(
      node.children,
      targetId,
      currentPath,
    );
    if (descendantPath) return descendantPath;
  }
}

export function clampGainsLossesPath(args: {
  hierarchy: GainsLossesBreakdownNode[];
  path: string[];
}): string[] {
  const selectedScopes = args.path
    .toReversed()
    .filter(
      (id) =>
        id.startsWith("asset-class:") || id.startsWith("gain-loss-investment:"),
    );
  for (const selectedScope of selectedScopes) {
    const currentPath = findCurrentPath(args.hierarchy, selectedScope);
    if (currentPath)
      return clampDrillTreePath({
        hierarchy: args.hierarchy,
        path: currentPath,
        isNodeDrillable: isGainsLossesNodeDrillable,
      });
  }
  if (selectedScopes.length) return [];
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
