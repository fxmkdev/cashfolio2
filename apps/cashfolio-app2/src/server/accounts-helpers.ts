import { prisma } from "../prisma.server";

type GroupPathNode = {
  id: string;
  name: string;
  parentGroupId: string | null;
};

type GroupPathSegmentsResolver = (groupId: string) => string[];

function createUnknownGroupPath(groupId: string): string[] {
  return [`Unknown group ${groupId}`];
}

export function createGroupPathSegmentsResolver(
  groups: GroupPathNode[],
): GroupPathSegmentsResolver {
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const pathSegmentsByGroupId = new Map<string, string[]>();
  const resolvingGroupIds = new Set<string>();

  const resolveSegments: GroupPathSegmentsResolver = (groupId) => {
    const cachedSegments = pathSegmentsByGroupId.get(groupId);
    if (cachedSegments) {
      return [...cachedSegments];
    }

    if (resolvingGroupIds.has(groupId)) {
      return createUnknownGroupPath(groupId);
    }

    const group = groupById.get(groupId);
    if (!group) {
      return createUnknownGroupPath(groupId);
    }

    resolvingGroupIds.add(groupId);
    const parentSegments = group.parentGroupId
      ? resolveSegments(group.parentGroupId)
      : [];
    resolvingGroupIds.delete(groupId);

    const segments = [...parentSegments, group.name];
    pathSegmentsByGroupId.set(groupId, segments);
    return [...segments];
  };

  return resolveSegments;
}

export function createGroupPathResolver(groups: GroupPathNode[]) {
  const resolveSegments = createGroupPathSegmentsResolver(groups);
  return (groupId: string): string => resolveSegments(groupId).join(" / ");
}

export function getGroupPath(groupId: string, groups: GroupPathNode[]): string {
  return createGroupPathResolver(groups)(groupId);
}

export function getGroupPathSegments(
  groupId: string,
  groups: GroupPathNode[],
): string[] {
  return createGroupPathSegmentsResolver(groups)(groupId);
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
