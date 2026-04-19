import type { BreakdownHierarchyNode } from "@/shared/breakdown-hierarchy";

export type { BreakdownHierarchyNode };

export type BreakdownBreadcrumb = {
  id: string | null;
  label: string;
};

const ACCOUNT_BREAKDOWN_NODE_PREFIX = "account:";

export function isBreakdownNodeDrillable(
  node: BreakdownHierarchyNode,
): boolean {
  return node.kind === "group" && node.children.length > 0;
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
  const clampedPath: string[] = [];
  let currentNodes = args.hierarchy;

  for (const nodeId of args.path) {
    const node = currentNodes.find((candidate) => candidate.id === nodeId);
    if (!node || !isBreakdownNodeDrillable(node)) {
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
  const breadcrumbs: BreakdownBreadcrumb[] = [
    { id: null, label: args.rootLabel },
  ];
  const currentPathNodes: BreakdownHierarchyNode[] = [];

  let currentNodes = args.hierarchy;
  const clampedPath: string[] = [];

  for (const nodeId of args.path) {
    const node = currentNodes.find((candidate) => candidate.id === nodeId);
    if (!node || !isBreakdownNodeDrillable(node)) {
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
