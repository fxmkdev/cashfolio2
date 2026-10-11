import { type BreakdownNodeKind } from "../../../shared/breakdown-hierarchy";
import { type Money, toMoney } from "../../../shared/money";

export type PeriodGroupNode = {
  id: string;
  name: string;
  parentGroupId: string | null;
};

export type BreakdownBucket = {
  id: string;
  label: string;
  kind: BreakdownNodeKind;
};

export type ExpenseBreakdownAccumulatorItem = {
  id: string;
  label: string;
  kind: BreakdownNodeKind;
  amount: Money;
};

export type BreakdownHierarchyAccumulatorItem = {
  accountId: string;
  accountName: string;
  groupId: string | null;
  amount: Money;
};

export function resolveGroupPathToRoot(args: {
  groupId: string;
  groupById: Map<string, PeriodGroupNode>;
}): PeriodGroupNode[] {
  const { groupId, groupById } = args;
  const path: PeriodGroupNode[] = [];
  const visited = new Set<string>();

  let currentGroupId: string | null = groupId;
  while (currentGroupId) {
    if (visited.has(currentGroupId)) {
      break;
    }

    visited.add(currentGroupId);
    const group = groupById.get(currentGroupId);
    if (!group) {
      break;
    }

    path.push(group);
    currentGroupId = group.parentGroupId;
  }

  return path;
}

export function getTopLevelGroup(args: {
  groupId: string;
  groupById: Map<string, PeriodGroupNode>;
}): PeriodGroupNode | null {
  const path = resolveGroupPathToRoot(args);
  if (path.length === 0) return null;
  return path[path.length - 1] ?? null;
}

export type MutableBreakdownHierarchyNode = {
  id: string;
  label: string;
  kind: BreakdownNodeKind;
  amount: Money;
  childrenById: Map<string, MutableBreakdownHierarchyNode>;
};

function createMutableBreakdownHierarchyNode(args: {
  id: string;
  label: string;
  kind: BreakdownNodeKind;
}): MutableBreakdownHierarchyNode {
  return {
    id: args.id,
    label: args.label,
    kind: args.kind,
    amount: toMoney(0),
    childrenById: new Map(),
  };
}

export function getOrCreateMutableBreakdownHierarchyNode(args: {
  nodeId: string;
  label: string;
  kind: BreakdownNodeKind;
  childrenById: Map<string, MutableBreakdownHierarchyNode>;
}): MutableBreakdownHierarchyNode {
  const existing = args.childrenById.get(args.nodeId);
  if (existing) {
    return existing;
  }

  const created = createMutableBreakdownHierarchyNode({
    id: args.nodeId,
    label: args.label,
    kind: args.kind,
  });
  args.childrenById.set(args.nodeId, created);
  return created;
}
