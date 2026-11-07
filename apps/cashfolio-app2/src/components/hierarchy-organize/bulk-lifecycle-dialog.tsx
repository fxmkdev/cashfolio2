import { ConfirmArchiveModal } from "@/components/dialogs/confirm-archive-modal";
import { ConfirmDeleteModal } from "@/components/dialogs/confirm-delete-modal";
import type { OrganizeNodeRef } from "@/shared/hierarchy-organize/types";
import type { Organizer } from "./use-organizer";
import { bulkLifecycleAvailability } from "./lifecycle";

export type BulkLifecycleDialog = {
  action: "archive" | "delete";
  items: OrganizeNodeRef[];
};

export function OrganizerBulkLifecycleDialog({
  dialog,
  organizer,
  onClose,
}: {
  dialog?: BulkLifecycleDialog;
  organizer: Organizer;
  onClose: () => void;
}) {
  const items = dialog?.items ?? [];
  const groups = items.filter(
    (item) => item.nodeType === "accountGroup",
  ).length;
  const accounts = items.length - groups;
  const names = items.map(
    (item) =>
      organizer.snapshot?.nodes.find((node) => node.id === item.id)?.name ??
      "Unavailable item",
  );
  const available = bulkLifecycleAvailability(
    organizer.snapshot,
    items,
    dialog?.action ?? "archive",
  );
  const props = {
    onClose,
    name: `${groups} ${groups === 1 ? "group" : "groups"} and ${accounts} ${accounts === 1 ? "account" : "accounts"} (${names.join(", ")})`,
    confirmDisabled:
      !available.enabled ||
      organizer.blocked ||
      (!!organizer.submitState.submissionError?.isBusy &&
        organizer.retryDisabled),
    submitState: { ...organizer.submitState, isSubmitting: organizer.pending },
    onRefreshConstraints: organizer.refresh,
    onConfirm: async () => {
      if (dialog)
        await organizer.performBulkLifecycle(dialog.action, items, onClose);
    },
  };
  return (
    <>
      <ConfirmArchiveModal
        {...props}
        title="Archive Selected Items"
        opened={dialog?.action === "archive"}
      />
      <ConfirmDeleteModal
        {...props}
        title="Delete Selected Items"
        opened={dialog?.action === "delete"}
      />
    </>
  );
}
