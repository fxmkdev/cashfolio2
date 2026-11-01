import { projectArchivedAccountHierarchy } from "../archived-account-hierarchy";
import type { OrganizeNode, OrganizeNodeRef } from "./types";

export function compareOrganizeNodes(
  a: Pick<OrganizeNode, "id" | "name" | "sortOrder">,
  b: Pick<OrganizeNode, "id" | "name" | "sortOrder">,
) {
  if (a.sortOrder !== b.sortOrder) {
    if (a.sortOrder === null) return 1;
    if (b.sortOrder === null) return -1;
    return a.sortOrder - b.sortOrder;
  }
  return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
}

export function descendants(nodes: OrganizeNode[], id: string) {
  const result = new Set([id]);
  const children = new Map<string, string[]>();
  for (const node of nodes) {
    if (node.parentId === null) continue;
    const list = children.get(node.parentId) ?? [];
    list.push(node.id);
    children.set(node.parentId, list);
  }
  const stack = [id];
  while (stack.length) {
    for (const child of children.get(stack.pop()!) ?? []) {
      if (result.has(child)) continue;
      result.add(child);
      stack.push(child);
    }
  }
  return result;
}

export function organizeDisplayRows(nodes: OrganizeNode[]) {
  const real = nodes.map((node) => ({
    ...node,
    parentId: node.parentId ?? undefined,
    persistedParentId: node.parentId,
    isVirtualArchivedGroup: false,
  }));
  const projection = projectArchivedAccountHierarchy(real);
  return [
    ...real.map((node) => ({
      ...node,
      parentId: projection.parentIdById.get(node.id),
    })),
    ...projection.archivedGroups.map(({ id, parentId }) => ({
      id,
      parentId,
      persistedParentId: parentId ?? null,
      nodeType: "accountGroup" as const,
      name: "Archived",
      isActive: false,
      isCashAccount: false,
      unit: null,
      sortOrder: null,
      isVirtualArchivedGroup: true,
    })),
  ].sort(
    (a, b) =>
      Number(a.isVirtualArchivedGroup) - Number(b.isVirtualArchivedGroup) ||
      compareOrganizeNodes(a, b),
  );
}

export type OrganizeDisplayRow = ReturnType<typeof organizeDisplayRows>[number];

export function normalizeOrganizeSelection(
  nodes: OrganizeNode[],
  items: OrganizeNodeRef[],
): OrganizeNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const selected = new Set<string>();
  for (const item of items) {
    if (selected.has(item.id)) throw new Error("Select each item only once.");
    const node = byId.get(item.id);
    if (!node || node.nodeType !== item.nodeType)
      throw new Error(
        "An item is no longer available. Refresh the account list.",
      );
    selected.add(item.id);
  }
  const roots = new Set(
    [...selected].filter((id) => {
      let parent = byId.get(id)?.parentId;
      const visited = new Set<string>();
      while (parent) {
        if (selected.has(parent)) return false;
        if (visited.has(parent))
          throw new Error("The group hierarchy contains a cycle.");
        visited.add(parent);
        parent = byId.get(parent)?.parentId;
      }
      return true;
    }),
  );
  const rows = organizeDisplayRows(nodes);
  const children = new Map<string | undefined, OrganizeDisplayRow[]>();
  for (const row of rows) {
    const list = children.get(row.parentId) ?? [];
    list.push(row);
    children.set(row.parentId, list);
  }
  const result: OrganizeNode[] = [];
  const visit = (parentId: string | undefined) => {
    for (const row of children.get(parentId) ?? []) {
      if (roots.has(row.id)) result.push(byId.get(row.id)!);
      visit(row.id);
    }
  };
  visit(undefined);
  if (result.length !== roots.size)
    throw new Error("The group hierarchy is invalid.");
  return result;
}

export function organizePath(nodes: OrganizeNode[], id: string) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const parts: string[] = [];
  const visited = new Set<string>();
  let node = byId.get(id);
  while (node && !visited.has(node.id)) {
    visited.add(node.id);
    parts.unshift(node.name);
    node = node.parentId ? byId.get(node.parentId) : undefined;
  }
  return parts.join(" / ");
}
