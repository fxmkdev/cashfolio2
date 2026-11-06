import { classificationOptions } from "@/shared/asset-class";
import type { ManagedClass } from "./-class-dialog";

export type AssetClassGridRow = ManagedClass & {
  path: string;
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
    let siblings = siblingsByParent.get(node.parentId);
    if (!siblings) {
      siblings = [];
      siblingsByParent.set(node.parentId, siblings);
    }
    siblings.push(node.id);
  }
  return ordered.map((option) => {
    const node = byId.get(option.value)!;
    return {
      ...node,
      path: option.label,
      hasChildren: siblingsByParent.has(node.id),
    };
  });
}
