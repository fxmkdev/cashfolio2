import { organizeDisplayRows } from "@/shared/account-organize/tree";
import type {
  OrganizeLifecycleAction,
  OrganizeNodeRef,
  OrganizeNode,
  OrganizeSnapshot,
} from "@/shared/account-organize/types";

export function organizeLifecycleAvailability(
  snapshot: OrganizeSnapshot | undefined,
  target: OrganizeNodeRef,
  action: OrganizeLifecycleAction,
) {
  const node = snapshot?.nodes.find(
    (item) => item.id === target.id && item.nodeType === target.nodeType,
  );
  const availability = node && snapshot?.actionAvailability[target.id];
  const enabled =
    action === "archive"
      ? availability?.archivable
      : action === "unarchive"
        ? availability?.unarchivable
        : availability?.deletable;
  const reason =
    action === "archive"
      ? availability?.archiveDisabledReason
      : action === "unarchive"
        ? availability?.unarchiveDisabledReason
        : availability?.deleteDisabledReason;
  return {
    enabled: !!enabled,
    reason:
      reason ??
      "This item is no longer available for that action. Refresh and try again.",
  };
}

/** Reflect a confirmed commit while its canonical version/eligibility reloads. */
export function committedLifecycleView(
  before: OrganizeSnapshot,
  action: OrganizeLifecycleAction,
  node: OrganizeNode,
) {
  const siblings = organizeDisplayRows(before.nodes, true).filter(
    (item) => (item.parentId ?? null) === node.parentId,
  );
  const index = siblings.findIndex((item) => item.id === node.id);
  const focusFallbackIds: string[] = [];
  for (let distance = 1; distance < siblings.length; distance++) {
    const after = siblings[index + distance];
    const previous = siblings[index - distance];
    if (after) focusFallbackIds.push(after.id);
    if (previous) focusFallbackIds.push(previous.id);
  }
  return {
    snapshot: {
      ...before,
      nodes:
        action === "delete"
          ? before.nodes.filter((item) => item.id !== node.id)
          : before.nodes.map((item) =>
              item.id === node.id
                ? { ...item, isActive: action === "unarchive" }
                : item,
            ),
    },
    revealIds: [node.id, ...(node.parentId ? [node.parentId] : [])],
    focusFallbackIds,
    message: `${node.name} ${action === "archive" ? "archived" : action === "unarchive" ? "unarchived" : "deleted"}.`,
  };
}
