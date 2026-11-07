type OrderedHierarchyNode = {
  parentId?: string;
  name: string;
  sortOrder: number | null;
  isVirtualArchivedGroup?: boolean;
};

export function sortAccountHierarchyNodes<Node extends OrderedHierarchyNode>(
  nodes: Node[],
): Node[] {
  return nodes.toSorted((left, right) => {
    const parentLeft = left.parentId ?? "";
    const parentRight = right.parentId ?? "";
    if (parentLeft !== parentRight) {
      return parentLeft.localeCompare(parentRight);
    }

    if (!!left.isVirtualArchivedGroup !== !!right.isVirtualArchivedGroup) {
      return left.isVirtualArchivedGroup ? 1 : -1;
    }

    if (left.sortOrder !== right.sortOrder) {
      if (left.sortOrder == null) return 1;
      if (right.sortOrder == null) return -1;
      return left.sortOrder - right.sortOrder;
    }

    return left.name.localeCompare(right.name);
  });
}
