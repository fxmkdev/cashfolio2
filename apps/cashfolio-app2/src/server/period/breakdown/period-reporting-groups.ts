import {
  defaultAssetClassNodes,
  type ClassificationNode,
} from "../../../shared/asset-class";
import type { PeriodGroupNode } from "./period-breakdown-state";
export const UNATTRIBUTED_GROUP_ID = "virtual:gain-loss-unattributed";
export function buildAssetClassGroups(
  nodes: readonly ClassificationNode[] = defaultAssetClassNodes,
): Map<string, PeriodGroupNode> {
  return new Map([
    ...nodes.map(
      (node) =>
        [
          node.id,
          { id: node.id, name: node.name, parentGroupId: node.parentId },
        ] as const,
    ),
    [
      "unclassified",
      { id: "unclassified", name: "Unclassified", parentGroupId: null },
    ],
  ]);
}
