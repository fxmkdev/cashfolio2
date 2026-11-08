import {
  getAccountUnarchiveAvailability,
  getGroupUnarchiveAvailability,
  getGroupArchiveAvailability,
  getGroupDeleteAvailability,
  type ActionAvailability,
} from "../accounts/account-tree-rules";
import type {
  OrganizeNode as AccountNode,
  OrganizeNodeRef as AccountNodeRef,
} from "../accounts/organize/types";
import type {
  OrganizeLifecycleAction,
  OrganizeActionAvailability,
  OrganizeNodeRef,
  OrganizeSnapshot,
} from "./types";
import { compareOrganizeNodes } from "./tree";

const unavailable =
  "A selected account or group is no longer available. Refresh the hierarchy.";

function hierarchyDepths(nodes: Map<string, AccountNode>) {
  const depths = new Map<string, number>();
  const visiting = new Set<string>();
  const depth = (node: AccountNode): number => {
    const known = depths.get(node.id);
    if (known !== undefined) return known;
    if (visiting.has(node.id))
      throw new Error("The group hierarchy contains a cycle.");
    visiting.add(node.id);
    let result = 0;
    if (node.parentId !== null) {
      const parent = nodes.get(node.parentId);
      if (!parent || parent.nodeType !== "accountGroup")
        throw new Error(
          "The group hierarchy is invalid. Refresh the hierarchy.",
        );
      result = depth(parent) + 1;
    }
    visiting.delete(node.id);
    depths.set(node.id, result);
    return result;
  };
  for (const node of nodes.values()) depth(node);
  return depths;
}

function assertAvailable(
  node: AccountNode,
  availability: ActionAvailability,
  blocker?: AccountNode,
) {
  if (!availability.enabled)
    throw new Error(
      `${node.name}: ${availability.disabledReason}${blocker ? ` (${blocker.name})` : ""}`,
    );
}

function assertUnarchiveAvailable(
  node: AccountNode,
  nodes: Map<string, AccountNode>,
) {
  let parent = node.parentId ? nodes.get(node.parentId) : undefined;
  while (parent?.isActive)
    parent = parent.parentId ? nodes.get(parent.parentId) : undefined;
  const rule =
    node.nodeType === "account"
      ? getAccountUnarchiveAvailability
      : getGroupUnarchiveAvailability;
  assertAvailable(
    node,
    rule({ isActive: node.isActive, hasInactiveAncestor: !!parent }),
    parent,
  );
}

function assertAccountAvailable(
  node: AccountNode,
  metadata: OrganizeActionAvailability,
  action: "archive" | "delete",
) {
  const enabled =
    action === "archive"
      ? node.isActive && metadata.archivable
      : metadata.deletable;
  const reason =
    action === "archive"
      ? metadata.archiveDisabledReason
      : metadata.deleteDisabledReason;
  assertAvailable(
    node,
    enabled
      ? { enabled: true, disabledReason: undefined }
      : {
          enabled: false,
          disabledReason:
            reason ??
            "This account is no longer available for that action. Refresh the hierarchy.",
        },
  );
}

function assertGroupAvailable(
  node: AccountNode,
  nodes: Map<string, AccountNode>,
  children: Map<string, AccountNode[]>,
  action: "archive" | "delete",
) {
  const remaining = (children.get(node.id) ?? []).filter(
    (child) => nodes.has(child.id) && (action === "delete" || child.isActive),
  );
  const hasAccounts = remaining.some((child) => child.nodeType === "account");
  const hasGroups = remaining.some(
    (child) => child.nodeType === "accountGroup",
  );
  const availability =
    action === "archive"
      ? getGroupArchiveAvailability({
          isActive: node.isActive,
          hasActiveChildAccounts: hasAccounts,
          hasActiveChildGroups: hasGroups,
        })
      : getGroupDeleteAvailability({
          hasChildAccounts: hasAccounts,
          hasChildGroups: hasGroups,
        });
  const blocker = remaining
    .filter(
      (child) => child.nodeType === (hasAccounts ? "account" : "accountGroup"),
    )
    .sort(compareOrganizeNodes)[0];
  assertAvailable(
    node,
    availability,
    action === "archive" && !node.isActive ? undefined : blocker,
  );
}

/** Validate Account List lifecycle prerequisites together, without changing the snapshot. */
export function planBulkLifecycle(
  snapshot: OrganizeSnapshot | undefined,
  targets: OrganizeNodeRef[],
  action: OrganizeLifecycleAction,
): AccountNodeRef[] {
  if (!targets.length) throw new Error("Select at least one account or group.");
  if (!snapshot) throw new Error(unavailable);
  const nodes = new Map<string, AccountNode>();
  for (const node of snapshot.nodes) {
    if (node.nodeType === "assetClass" || nodes.has(node.id))
      throw new Error(
        "The account hierarchy is invalid. Refresh the hierarchy.",
      );
    nodes.set(node.id, { ...node });
  }
  const selected = new Set<string>();
  const items = targets.map((target) => {
    const node = nodes.get(target.id);
    if (
      !node ||
      node.nodeType !== target.nodeType ||
      !snapshot.actionAvailability[node.id]
    )
      throw new Error(unavailable);
    if (selected.has(node.id))
      throw new Error("Select each account or group only once.");
    selected.add(node.id);
    return node;
  });
  const depths = hierarchyDepths(nodes);
  const direction = action === "unarchive" ? 1 : -1;
  items.sort(
    (a, b) =>
      direction * (depths.get(a.id)! - depths.get(b.id)!) ||
      compareOrganizeNodes(a, b),
  );
  const children = new Map<string, AccountNode[]>();
  for (const node of nodes.values()) {
    if (node.parentId === null) continue;
    const siblings = children.get(node.parentId) ?? [];
    siblings.push(node);
    children.set(node.parentId, siblings);
  }
  for (const node of items) {
    const metadata = snapshot.actionAvailability[node.id];
    if (action === "unarchive") assertUnarchiveAvailable(node, nodes);
    else if (node.nodeType === "account")
      assertAccountAvailable(node, metadata, action);
    else assertGroupAvailable(node, nodes, children, action);
    if (action === "delete") nodes.delete(node.id);
    else node.isActive = action === "unarchive";
  }
  return items.map(({ id, nodeType }) => ({ id, nodeType }));
}
