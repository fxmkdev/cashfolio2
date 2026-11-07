import {
  planStructuralMove,
  unchangedHierarchy,
} from "../hierarchy-organize/structure";
import {
  validateAccountName,
  validateAccountGroupName,
} from "../account-validation";
import {
  descendants,
  normalizeOrganizeSelection,
} from "../hierarchy-organize/tree";
import type { OrganizeMove, OrganizeNode, OrganizeChange } from "./types";

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
  const destination = nodes.find((node) => node.id === move.parentId);
  const structural = planStructuralMove(nodes, move);
  const cashChanges = new Map<string, boolean>();
  for (const root of roots) {
    if (!destination || root.parentId === move.parentId) continue;
    for (const id of descendants(nodes, root.id))
      cashChanges.set(id, destination.isCashAccount);
  }
  const next = structural.map((node) => ({
    ...node,
    isCashAccount: cashChanges.get(node.id) ?? node.isCashAccount,
  }));
  validateOrganizeTree(next);
  // Preserve nullable orders for effective no-ops.
  return unchangedHierarchy(nodes, next) &&
    nodes.every((node, i) => node.isCashAccount === next[i].isCashAccount)
    ? nodes
    : next;
}

export function organizeChanges(
  before: OrganizeNode[],
  after: OrganizeNode[],
): OrganizeChange[] {
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
