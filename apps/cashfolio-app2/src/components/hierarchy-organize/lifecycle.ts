import { organizeDisplayRows } from "@/shared/hierarchy-organize/tree";
import type {
  OrganizeLifecycleAction,
  OrganizeNodeRef,
  OrganizeNode,
  OrganizeSnapshot,
} from "@/shared/hierarchy-organize/types";

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

export function bulkLifecycleAvailability(
  snapshot: OrganizeSnapshot | undefined,
  targets: OrganizeNodeRef[],
  action: OrganizeLifecycleAction,
) {
  if (!targets.length)
    return { enabled: false, reason: "Select at least one account or group." };
  for (const target of targets) {
    const availability = organizeLifecycleAvailability(
      snapshot,
      target,
      action,
    );
    if (!availability.enabled) {
      const node = snapshot?.nodes.find((node) => node.id === target.id);
      return {
        enabled: false,
        reason: `${node?.name ?? "Selected item"}: ${availability.reason}`,
      };
    }
  }
  return { enabled: true, reason: undefined };
}

export function bulkStatusAction(
  snapshot: OrganizeSnapshot | undefined,
  targets: OrganizeNodeRef[],
): "archive" | "unarchive" {
  return targets.length > 0 &&
    targets.every((target) =>
      snapshot?.nodes.some(
        (node) =>
          node.id === target.id &&
          node.nodeType === target.nodeType &&
          node.isActive === false,
      ),
    )
    ? "unarchive"
    : "archive";
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
              item.id === node.id && item.nodeType !== "assetClass"
                ? { ...item, isActive: action === "unarchive" }
                : item,
            ),
    },
    revealIds: [node.id, ...(node.parentId ? [node.parentId] : [])],
    focusFallbackIds,
    message: `${node.name} ${action === "archive" ? "archived" : action === "unarchive" ? "unarchived" : "deleted"}.`,
  };
}
