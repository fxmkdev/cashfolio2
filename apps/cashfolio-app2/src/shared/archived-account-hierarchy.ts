export type ArchiveHierarchyNode = {
  id: string;
  nodeType: "account" | "accountGroup";
  parentId: string | undefined;
  isActive: boolean;
};

/** Project display relationships without changing the real account hierarchy. */
export function projectArchivedAccountHierarchy(nodes: ArchiveHierarchyNode[]) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const parentIdById = new Map<string, string | undefined>();
  const archivedGroups = new Map<
    string,
    { id: string; parentId: string | undefined }
  >();

  for (const node of nodes) {
    let ancestorId = node.parentId;
    let hasArchivedAncestor = false;
    const visited = new Set<string>();
    while (ancestorId && !visited.has(ancestorId)) {
      visited.add(ancestorId);
      const ancestor = byId.get(ancestorId);
      if (!ancestor) break;
      if (!ancestor.isActive) {
        hasArchivedAncestor = true;
        break;
      }
      ancestorId = ancestor.parentId;
    }

    if (node.isActive || hasArchivedAncestor) {
      parentIdById.set(node.id, node.parentId);
      continue;
    }

    const id = node.parentId
      ? `__archived__:group:${node.parentId}`
      : "__archived__:root";
    archivedGroups.set(id, { id, parentId: node.parentId });
    parentIdById.set(node.id, id);
  }

  for (const group of archivedGroups.values()) {
    parentIdById.set(group.id, group.parentId);
  }
  return { parentIdById, archivedGroups: [...archivedGroups.values()] };
}
