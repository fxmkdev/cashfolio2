import { classificationOptions } from "@/shared/asset-class";
import type { ManagedClass } from "./-class-dialog";

export type AssetClassGridRow = ManagedClass & {
  path: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
  hasChildren: boolean;
};

export function buildAssetClassGridRows(
  nodes: ManagedClass[],
): AssetClassGridRow[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const ordered = classificationOptions(nodes);
  const siblingsByParent = new Map<string | null, string[]>();
  for (const option of ordered) {
    const node = byId.get(option.value)!;
    siblingsByParent.getOrInsertComputed(node.parentId, () => []).push(node.id);
  }
  return ordered.map((option) => {
    const node = byId.get(option.value)!;
    const siblings = siblingsByParent.get(node.parentId)!;
    const index = siblings.indexOf(node.id);
    return {
      ...node,
      path: option.label,
      canMoveUp: index > 0,
      canMoveDown: index < siblings.length - 1,
      hasChildren: siblingsByParent.has(node.id),
    };
  });
}
