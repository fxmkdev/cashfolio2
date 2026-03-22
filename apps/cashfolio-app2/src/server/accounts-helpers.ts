import { prisma } from "../prisma.server";

export function getGroupPath(
  groupId: string,
  groups: { id: string; name: string; parentGroupId: string | null }[],
): string {
  const group = groups.find((g) => g.id === groupId);
  if (!group) return `Unknown group ${groupId}`;
  const prefix = group.parentGroupId
    ? `${getGroupPath(group.parentGroupId, groups)} / `
    : "";
  return prefix + group.name;
}

export type GroupHierarchyNode = {
  id: string;
  parentGroupId: string | null;
  isActive: boolean;
};

export function hasInactiveAncestorGroup(
  groupId: string | null | undefined,
  groupById: Map<string, GroupHierarchyNode>,
): boolean {
  let currentGroupId = groupId ?? null;
  while (currentGroupId) {
    const group = groupById.get(currentGroupId);
    if (!group) return true;
    if (!group.isActive) return true;
    currentGroupId = group.parentGroupId;
  }
  return false;
}

export async function getGroupHierarchy(
  accountBookId: string,
): Promise<Map<string, GroupHierarchyNode>> {
  const groups = await prisma.accountGroup.findMany({
    where: { accountBookId },
    select: { id: true, parentGroupId: true, isActive: true },
  });
  return new Map(groups.map((g) => [g.id, g]));
}

export function ensureNoGroupCycle(params: {
  groupId: string;
  parentGroupId?: string | null;
  groupById: Map<string, GroupHierarchyNode>;
}): void {
  const { groupId, parentGroupId, groupById } = params;
  if (!parentGroupId) return;
  if (parentGroupId === groupId) {
    throw new Error("A group cannot be its own parent");
  }

  const visitedGroupIds = new Set<string>();
  let currentGroupId: string | null = parentGroupId;

  while (currentGroupId) {
    if (currentGroupId === groupId) {
      throw new Error("A group cannot be moved under one of its sub-groups");
    }
    if (visitedGroupIds.has(currentGroupId)) {
      throw new Error(
        "Cannot update group because the group hierarchy contains a cycle",
      );
    }
    visitedGroupIds.add(currentGroupId);
    currentGroupId = groupById.get(currentGroupId)?.parentGroupId ?? null;
  }
}
