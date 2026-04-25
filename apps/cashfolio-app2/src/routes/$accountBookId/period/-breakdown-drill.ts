import type { BreakdownHierarchyNode } from "@/shared/breakdown-hierarchy";

export type { BreakdownHierarchyNode };

export type DrillTreeNode<TNode extends DrillTreeNode<TNode>> = {
  id: string;
  label: string;
  children: TNode[];
};

export type BreakdownBreadcrumb = {
  id: string | null;
  label: string;
};

const ACCOUNT_BREAKDOWN_NODE_PREFIX = "account:";

export function isBreakdownNodeDrillable(
  node: BreakdownHierarchyNode,
): boolean {
  return node.kind === "group" && isDrillTreeNodeDrillable(node);
}

export function isDrillTreeNodeDrillable<TNode extends DrillTreeNode<TNode>>(
  node: TNode,
): boolean {
  return node.children.length > 0;
}

export function parseBreakdownAccountId(nodeId: string): string | null {
  if (!nodeId.startsWith(ACCOUNT_BREAKDOWN_NODE_PREFIX)) {
    return null;
  }

  const accountId = nodeId.slice(ACCOUNT_BREAKDOWN_NODE_PREFIX.length).trim();
  return accountId.length > 0 ? accountId : null;
}

export function clampBreakdownPath(args: {
  hierarchy: BreakdownHierarchyNode[];
  path: string[];
}): string[] {
  return clampDrillTreePath({
    hierarchy: args.hierarchy,
    path: args.path,
    isNodeDrillable: isBreakdownNodeDrillable,
  });
}

export function clampDrillTreePath<TNode extends DrillTreeNode<TNode>>(args: {
  hierarchy: TNode[];
  path: string[];
  isNodeDrillable?: (node: TNode) => boolean;
}): string[] {
  const clampedPath: string[] = [];
  let currentNodes = args.hierarchy;
  const isNodeDrillable =
    args.isNodeDrillable ?? ((node: TNode) => isDrillTreeNodeDrillable(node));

  for (const nodeId of args.path) {
    const node = currentNodes.find((candidate) => candidate.id === nodeId);
    if (!node || !isNodeDrillable(node)) {
      break;
    }

    clampedPath.push(node.id);
    currentNodes = node.children;
  }

  return clampedPath;
}

export function getBreakdownDrillState(args: {
  hierarchy: BreakdownHierarchyNode[];
  path: string[];
  rootLabel: string;
}): {
  clampedPath: string[];
  breadcrumbs: BreakdownBreadcrumb[];
  currentNodes: BreakdownHierarchyNode[];
  currentPathNodes: BreakdownHierarchyNode[];
} {
  return getDrillTreeState({
    hierarchy: args.hierarchy,
    path: args.path,
    rootLabel: args.rootLabel,
    isNodeDrillable: isBreakdownNodeDrillable,
  });
}

export function getDrillTreeState<TNode extends DrillTreeNode<TNode>>(args: {
  hierarchy: TNode[];
  path: string[];
  rootLabel: string;
  isNodeDrillable?: (node: TNode) => boolean;
}): {
  clampedPath: string[];
  breadcrumbs: BreakdownBreadcrumb[];
  currentNodes: TNode[];
  currentPathNodes: TNode[];
} {
  const breadcrumbs: BreakdownBreadcrumb[] = [
    { id: null, label: args.rootLabel },
  ];
  const currentPathNodes: TNode[] = [];

  let currentNodes = args.hierarchy;
  const clampedPath: string[] = [];
  const isNodeDrillable =
    args.isNodeDrillable ?? ((node: TNode) => isDrillTreeNodeDrillable(node));

  for (const nodeId of args.path) {
    const node = currentNodes.find((candidate) => candidate.id === nodeId);
    if (!node || !isNodeDrillable(node)) {
      break;
    }

    clampedPath.push(node.id);
    currentPathNodes.push(node);
    breadcrumbs.push({
      id: node.id,
      label: node.label,
    });
    currentNodes = node.children;
  }

  return {
    clampedPath,
    breadcrumbs,
    currentNodes,
    currentPathNodes,
  };
}
