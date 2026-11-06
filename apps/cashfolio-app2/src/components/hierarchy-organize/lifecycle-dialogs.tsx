import { ConfirmArchiveModal } from "@/components/dialogs/confirm-archive-modal";
import { ConfirmDeleteModal } from "@/components/dialogs/confirm-delete-modal";
import type { OrganizeNode } from "@/shared/hierarchy-organize/types";
import type { Organizer } from "./use-organizer";

export type LifecycleDialog = {
  action: "archive" | "delete";
  node: OrganizeNode;
};

export function OrganizerLifecycleDialogs({
  dialog,
  organizer,
  onClose,
}: {
  dialog?: LifecycleDialog;
  organizer: Organizer;
  onClose: () => void;
}) {
  const props = {
    onClose,
    name: dialog?.node.name,
    onRefreshConstraints: organizer.refresh,
    submitState: { ...organizer.submitState, isSubmitting: organizer.pending },
    onConfirm: async () => {
      if (dialog)
        await organizer.performLifecycle(dialog.action, dialog.node, onClose);
    },
  };
  const entity =
    organizer.kind === "categories"
      ? dialog?.node.nodeType === "accountGroup"
        ? "Category Group"
        : "Category"
      : dialog?.node.nodeType === "accountGroup"
        ? "Group"
        : "Account";
  return (
    <>
      <ConfirmArchiveModal
        {...props}
        title={`Archive ${entity}`}
        opened={dialog?.action === "archive"}
      />
      <ConfirmDeleteModal
        {...props}
        title={`Delete ${entity}`}
        opened={dialog?.action === "delete"}
      />
    </>
  );
}
