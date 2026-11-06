import {
  compareOrganizeNodes,
  descendants,
  normalizeOrganizeSelection,
  organizeDisplayRows,
} from "./tree";
import {
  canContainChildren,
  type HierarchyNode,
  type OrganizeMove,
} from "./types";
export function movePositions(
  nodes: HierarchyNode[],
  roots: HierarchyNode[],
  move: OrganizeMove,
) {
  const rootIds = new Set(roots.map((node) => node.id));
  const siblings = nodes
    .filter((node) => node.parentId === move.parentId && !rootIds.has(node.id))
    .sort(compareOrganizeNodes);
  let index = move.placement === "first" ? 0 : siblings.length;
  if (move.placement === "before" || move.placement === "after") {
    index = siblings.findIndex((node) => node.id === move.anchorId);
    if (index < 0)
      throw new Error("Select an available sibling for placement.");
    if (move.placement === "after") index++;
  }
  const ordered = [
    ...siblings.slice(0, index),
    ...roots,
    ...siblings.slice(index),
  ];
  const positions = new Map<string, number>();
  ordered.forEach((node, i) => positions.set(node.id, i));
  const sourceParents = new Set(roots.map((node) => node.parentId));
  sourceParents.delete(move.parentId);
  for (const parentId of sourceParents) {
    nodes
      .filter((node) => node.parentId === parentId && !rootIds.has(node.id))
      .sort(compareOrganizeNodes)
      .forEach((node, i) => positions.set(node.id, i));
  }
  return positions;
}

export function unchangedHierarchy(
  nodes: HierarchyNode[],
  next: HierarchyNode[],
) {
  const siblingOrder = (items: HierarchyNode[]) => {
    const displayed = organizeDisplayRows(items);
    const parents = [...new Set(displayed.map((node) => node.parentId))].sort();
    return parents.map((parentId) =>
      displayed
        .filter((node) => node.parentId === parentId)
        .map((node) => node.id),
    );
  };
  const sameStructure = nodes.every(
    (node, i) => node.parentId === next[i].parentId,
  );
  return (
    sameStructure &&
    JSON.stringify(siblingOrder(nodes)) === JSON.stringify(siblingOrder(next))
  );
}

export function planStructuralMove<N extends HierarchyNode>(
  nodes: N[],
  move: OrganizeMove,
): N[] {
  const roots = normalizeOrganizeSelection(nodes, move.items);
  if (!roots.length) throw new Error("Select at least one item.");
  const destination = nodes.find((node) => node.id === move.parentId);
  if (
    move.parentId !== null &&
    (!destination || !canContainChildren(destination))
  )
    throw new Error("Select an available destination.");
  const movingIds = new Set(
    roots.flatMap((node) => [...descendants(nodes, node.id)]),
  );
  if (move.parentId !== null && movingIds.has(move.parentId))
    throw new Error("An item cannot be moved into itself or its descendants.");
  const positions = movePositions(nodes, roots, move);
  const ids = new Set(roots.map((node) => node.id));
  const next = nodes.map((node) => ({
    ...node,
    parentId: ids.has(node.id) ? move.parentId : node.parentId,
    sortOrder: positions.get(node.id) ?? node.sortOrder,
  }));
  return unchangedHierarchy(nodes, next) ? nodes : next;
}
