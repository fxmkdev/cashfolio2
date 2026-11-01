import {
  validateAccountName,
  validateAccountGroupName,
} from "../account-validation";
import {
  compareOrganizeNodes,
  descendants,
  normalizeOrganizeSelection,
  organizeDisplayRows,
} from "./tree";
import type { OrganizeMove, OrganizeNode, OrganizeRestore } from "./types";

export function validateOrganizeTree(nodes: OrganizeNode[]) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  if (byId.size !== nodes.length) throw new Error("Duplicate hierarchy item.");
  const siblings = new Map<string, OrganizeNode[]>();
  for (const node of nodes) {
    let parentId = node.parentId;
    const visited = new Set([node.id]);
    while (parentId !== null) {
      if (visited.has(parentId))
        throw new Error(
          "A group cannot be moved into itself or its descendants.",
        );
      visited.add(parentId);
      const parent = byId.get(parentId);
      if (!parent || parent.nodeType !== "accountGroup")
        throw new Error("Select an available group.");
      if (node.isActive && !parent.isActive)
        throw new Error(
          "Active accounts and groups cannot belong to an archived group.",
        );
      parentId = parent.parentId;
    }
    const parent = node.parentId ? byId.get(node.parentId) : undefined;
    if (parent && parent.isCashAccount !== node.isCashAccount)
      throw new Error(
        "Items must use their parent group's Cash Account setting.",
      );
    if (
      node.isCashAccount &&
      node.nodeType === "account" &&
      node.unit !== "CURRENCY"
    )
      throw new Error("Only currency accounts can be included in cash flow.");
    const key = JSON.stringify([node.parentId, node.nodeType]);
    const list = siblings.get(key) ?? [];
    const error =
      node.nodeType === "account"
        ? validateAccountName(
            node.name,
            list.map((n) => n.name),
          )
        : validateAccountGroupName(
            node.name,
            list.map((n) => n.name),
          );
    if (error) throw new Error(error);
    list.push(node);
    siblings.set(key, list);
  }
}

export function planAccountMove(nodes: OrganizeNode[], move: OrganizeMove) {
  const roots = normalizeOrganizeSelection(nodes, move.items);
  if (!roots.length) throw new Error("Select at least one account or group.");
  const rootIds = new Set(roots.map((node) => node.id));
  const destination = nodes.find((node) => node.id === move.parentId);
  if (move.parentId !== null && destination?.nodeType !== "accountGroup")
    throw new Error("Select an available destination group.");
  const movingIds = new Set(
    roots.flatMap((node) => [...descendants(nodes, node.id)]),
  );
  if (move.parentId !== null && movingIds.has(move.parentId))
    throw new Error("A group cannot be moved into itself or its descendants.");
  const siblings = nodes
    .filter((node) => node.parentId === move.parentId && !rootIds.has(node.id))
    .sort(compareOrganizeNodes);
  let index = move.placement === "first" ? 0 : siblings.length;
  if (move.placement === "before" || move.placement === "after") {
    index = siblings.findIndex((node) => node.id === move.anchorId);
    if (index < 0)
      throw new Error("Select an available sibling for placement.");
    const rows = organizeDisplayRows(nodes);
    const anchor = rows.find((node) => node.id === move.anchorId)!;
    // Compare the section each root would occupy at its proposed destination.
    const projected = organizeDisplayRows(
      nodes.map((node) =>
        rootIds.has(node.id) ? { ...node, parentId: move.parentId } : node,
      ),
    );
    if (
      roots.some(
        (root) =>
          projected.find((row) => row.id === root.id)?.parentId !==
          anchor.parentId,
      )
    )
      throw new Error(
        "Active and archived items are displayed separately. Choose First or Last, or drop into a group.",
      );
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
  const cashChanges = new Map<string, boolean>();
  for (const root of roots) {
    if (!destination || root.parentId === move.parentId) continue;
    for (const id of descendants(nodes, root.id))
      cashChanges.set(id, destination.isCashAccount);
  }
  const next = nodes.map((node) => ({
    ...node,
    parentId: rootIds.has(node.id) ? move.parentId : node.parentId,
    sortOrder: positions.get(node.id) ?? node.sortOrder,
    isCashAccount: cashChanges.get(node.id) ?? node.isCashAccount,
  }));
  validateOrganizeTree(next);
  // An unchanged visible order must not silently normalize nullable sort orders.
  const siblingOrder = (items: OrganizeNode[]) => {
    const displayed = organizeDisplayRows(items);
    const parents = [...new Set(displayed.map((node) => node.parentId))].sort();
    return parents.map((parentId) =>
      displayed
        .filter((node) => node.parentId === parentId)
        .map((node) => node.id),
    );
  };
  const sameStructure = nodes.every(
    (node, i) =>
      node.parentId === next[i].parentId &&
      node.isCashAccount === next[i].isCashAccount,
  );
  if (
    sameStructure &&
    JSON.stringify(siblingOrder(nodes)) === JSON.stringify(siblingOrder(next))
  )
    return nodes;
  return next;
}

export function organizeChanges(
  before: OrganizeNode[],
  after: OrganizeNode[],
): OrganizeRestore[] {
  const byId = new Map(before.map((node) => [node.id, node]));
  return after
    .filter((node) => {
      const previous = byId.get(node.id)!;
      return (
        previous.parentId !== node.parentId ||
        previous.sortOrder !== node.sortOrder ||
        previous.isCashAccount !== node.isCashAccount
      );
    })
    .map(({ id, nodeType, parentId, sortOrder, isCashAccount }) => ({
      id,
      nodeType,
      parentId,
      sortOrder,
      isCashAccount,
    }));
}

export function restoreAccountMove(
  nodes: OrganizeNode[],
  restore: OrganizeRestore[],
) {
  const updates = new Map(restore.map((node) => [node.id, node]));
  if (!restore.length || updates.size !== restore.length)
    throw new Error("Invalid Undo receipt.");
  for (const update of restore) {
    if (
      !nodes.some(
        (node) => node.id === update.id && node.nodeType === update.nodeType,
      )
    )
      throw new Error("An Undo item is no longer available.");
  }
  const result = nodes.map((node) => ({ ...node, ...updates.get(node.id) }));
  validateOrganizeTree(result);
  return result;
}
