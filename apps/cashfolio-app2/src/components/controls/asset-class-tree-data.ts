import type { TreeNodeData } from "@mantine/core";
import {
  classificationOptions,
  type ClassificationNode,
} from "../../shared/asset-class";

export function buildAssetClassTreeData(
  nodes: readonly ClassificationNode[],
): TreeNodeData[] {
  const roots: TreeNodeData[] = [];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const treeNodes = new Map<string, TreeNodeData>();

  for (const option of classificationOptions(nodes)) {
    const node = byId.get(option.value)!;
    const treeNode: TreeNodeData = {
      value: node.id,
      label: node.name,
      nodeProps: { searchLabel: option.label },
    };
    treeNodes.set(node.id, treeNode);
    const parent = node.parentId ? treeNodes.get(node.parentId) : undefined;
    if (parent) {
      parent.children ??= [];
      parent.children.push(treeNode);
    } else {
      roots.push(treeNode);
    }
  }

  return roots;
}

export function filterAssetClassTreeNode(query: string, node: TreeNodeData) {
  const label = node.nodeProps?.searchLabel ?? node.label;
  return String(label).toLowerCase().includes(query.trim().toLowerCase());
}
