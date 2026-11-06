import type {
  OrganizeLifecycleAction,
  OrganizeNodeRef,
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
