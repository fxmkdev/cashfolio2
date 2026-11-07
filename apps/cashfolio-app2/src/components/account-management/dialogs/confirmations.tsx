import { getAccountConstraintMessage } from "@/shared/account-presentation";
import { ConfirmArchiveModal } from "@/components/dialogs/confirm-archive-modal";
import { ConfirmDeleteModal } from "@/components/dialogs/confirm-delete-modal";
import { getEntityLabel } from "../labels";
import type { AccountsPageViewProps } from "../view-types";
type ArchiveConfirmationProps = Pick<
  AccountsPageViewProps,
  | "onRefreshConstraints"
  | "archivingRow"
  | "onCloseArchive"
  | "managementContext"
  | "onConfirmArchive"
>;

export function ArchiveConfirmation(props: ArchiveConfirmationProps) {
  const {
    onRefreshConstraints,
    archivingRow,
    onCloseArchive,
    managementContext = "accounts",
    onConfirmArchive,
  } = props;
  const formatErrorMessage = (message: string) =>
    getAccountConstraintMessage(message, managementContext) ?? message;
  return (
    <ConfirmArchiveModal
      formatErrorMessage={formatErrorMessage}
      onRefreshConstraints={onRefreshConstraints}
      opened={!!archivingRow}
      onClose={onCloseArchive}
      title={
        archivingRow
          ? `Archive ${getEntityLabel(archivingRow.nodeType, managementContext)}`
          : "Archive"
      }
      name={archivingRow?.name}
      onConfirm={onConfirmArchive}
    />
  );
}

type DeleteConfirmationProps = Pick<
  AccountsPageViewProps,
  | "onRefreshConstraints"
  | "deletingRow"
  | "onCloseDelete"
  | "managementContext"
  | "onConfirmDelete"
>;

export function DeleteConfirmation(props: DeleteConfirmationProps) {
  const {
    onRefreshConstraints,
    deletingRow,
    onCloseDelete,
    managementContext = "accounts",
    onConfirmDelete,
  } = props;
  const formatErrorMessage = (message: string) =>
    getAccountConstraintMessage(message, managementContext) ?? message;
  return (
    <ConfirmDeleteModal
      formatErrorMessage={formatErrorMessage}
      onRefreshConstraints={onRefreshConstraints}
      opened={!!deletingRow}
      onClose={onCloseDelete}
      title={
        deletingRow
          ? `Delete ${getEntityLabel(deletingRow.nodeType, managementContext)}`
          : "Delete"
      }
      name={deletingRow?.name}
      onConfirm={onConfirmDelete}
    />
  );
}
