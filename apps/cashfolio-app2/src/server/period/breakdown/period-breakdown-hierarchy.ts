import {
  type MutableBreakdownHierarchyNode,
  type BreakdownHierarchyAccumulatorItem,
  type PeriodGroupNode,
  resolveGroupPathToRoot,
  getOrCreateMutableBreakdownHierarchyNode,
} from "./period-breakdown-state";
import { type BreakdownHierarchyNode } from "../../../shared/breakdown-hierarchy";
import {
  type Money,
  toMoney,
  moneyRound2 as round2,
  moneyAdd,
  moneyIsZero,
  moneySubtract,
} from "../../../shared/money";

function finalizeBreakdownHierarchyNodes(
  childrenById: Map<string, MutableBreakdownHierarchyNode>,
): {
  hierarchy: BreakdownHierarchyNode<Money>[];
  hasHiddenAmountDiscrepancy: boolean;
  hiddenAmountDiscrepancyNodeIdsInSubtree: Set<string>;
  rawDisplayedAmount: Money;
  prunedNodeCount: number;
} {
  const nodes: BreakdownHierarchyNode<Money>[] = [];
  const hiddenAmountDiscrepancyNodeIdsInSubtree = new Set<string>();
  let rawDisplayedAmount: Money = toMoney(0);
  let prunedNodeCount = 0;

  for (const node of childrenById.values()) {
    if (node.kind === "account") {
      const roundedAmount = round2(node.amount);

      if (toMoney(roundedAmount).comparedTo(0) <= 0) {
        prunedNodeCount += 1;
        continue;
      }

      rawDisplayedAmount = moneyAdd(rawDisplayedAmount, node.amount);
      nodes.push({
        id: node.id,
        label: node.label,
        kind: node.kind,
        amount: roundedAmount,
        children: [],
      });
      continue;
    }

    const {
      hierarchy: children,
      hasHiddenAmountDiscrepancy: hasChildDiscrepancy,
      hiddenAmountDiscrepancyNodeIdsInSubtree: childDiscrepancyNodeIds,
      rawDisplayedAmount: rawDisplayedChildrenAmount,
      prunedNodeCount: prunedChildNodeCount,
    } = finalizeBreakdownHierarchyNodes(node.childrenById);
    prunedNodeCount += prunedChildNodeCount;

    const roundedAmount = round2(node.amount);
    const roundedDisplayedChildrenAmount = round2(rawDisplayedChildrenAmount);

    if (toMoney(roundedAmount).comparedTo(0) <= 0) {
      prunedNodeCount += 1;
      continue;
    }

    if (children.length === 0) {
      prunedNodeCount += 1;
      continue;
    }

    if (
      prunedChildNodeCount > 0 &&
      !moneyIsZero(moneySubtract(roundedDisplayedChildrenAmount, roundedAmount))
    ) {
      hiddenAmountDiscrepancyNodeIdsInSubtree.add(node.id);
    } else if (hasChildDiscrepancy) {
      hiddenAmountDiscrepancyNodeIdsInSubtree.add(node.id);
    }

    for (const nodeId of childDiscrepancyNodeIds) {
      hiddenAmountDiscrepancyNodeIdsInSubtree.add(nodeId);
    }

    rawDisplayedAmount = moneyAdd(rawDisplayedAmount, node.amount);
    nodes.push({
      id: node.id,
      label: node.label,
      kind: node.kind,
      amount: roundedAmount,
      children,
    });
  }

  nodes.sort(
    (a, b) =>
      toMoney(b.amount).comparedTo(a.amount) ||
      a.label.localeCompare(b.label, "en") ||
      a.id.localeCompare(b.id),
  );

  return {
    hierarchy: nodes,
    hasHiddenAmountDiscrepancy:
      hiddenAmountDiscrepancyNodeIdsInSubtree.size > 0,
    hiddenAmountDiscrepancyNodeIdsInSubtree,
    rawDisplayedAmount,
    prunedNodeCount,
  };
}

export function buildBreakdownHierarchyWithMeta(args: {
  items: BreakdownHierarchyAccumulatorItem[];
  groupById: Map<string, PeriodGroupNode>;
}): {
  hierarchy: BreakdownHierarchyNode<Money>[];
  hasHiddenAmountDiscrepancy: boolean;
  hiddenAmountDiscrepancyNodeIds: string[];
} {
  const rootChildrenById = new Map<string, MutableBreakdownHierarchyNode>();

  for (const item of args.items) {
    if (moneyIsZero(item.amount)) {
      continue;
    }

    const groupPath = item.groupId
      ? resolveGroupPathToRoot({
          groupId: item.groupId,
          groupById: args.groupById,
        }).reverse()
      : [];

    let currentChildrenById = rootChildrenById;

    for (const group of groupPath) {
      const groupNode = getOrCreateMutableBreakdownHierarchyNode({
        nodeId: `group:${group.id}`,
        label: group.name,
        kind: "group",
        childrenById: currentChildrenById,
      });
      groupNode.amount = moneyAdd(groupNode.amount, item.amount);
      currentChildrenById = groupNode.childrenById;
    }

    const accountNode = getOrCreateMutableBreakdownHierarchyNode({
      nodeId: `account:${item.accountId}`,
      label: item.accountName,
      kind: "account",
      childrenById: currentChildrenById,
    });
    accountNode.amount = moneyAdd(accountNode.amount, item.amount);
  }

  const {
    hierarchy,
    hasHiddenAmountDiscrepancy,
    hiddenAmountDiscrepancyNodeIdsInSubtree,
  } = finalizeBreakdownHierarchyNodes(rootChildrenById);

  return {
    hierarchy,
    hasHiddenAmountDiscrepancy,
    hiddenAmountDiscrepancyNodeIds: Array.from(
      hiddenAmountDiscrepancyNodeIdsInSubtree,
    ).sort((a, b) => a.localeCompare(b, "en")),
  };
}

export function buildBreakdownHierarchy(args: {
  items: BreakdownHierarchyAccumulatorItem[];
  groupById: Map<string, PeriodGroupNode>;
}): BreakdownHierarchyNode<Money>[] {
  return buildBreakdownHierarchyWithMeta(args).hierarchy;
}
