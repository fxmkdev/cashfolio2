import { RowActionsMenu } from "@/components/grid/row-actions-menu";
import {
  IconArrowsSort,
  IconArchive,
  IconArchiveOff,
  IconPencil,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";

export function ArchivedAccountTreeActionsCell({
  rowLabel,
  reorderLabel,
  reorderEnabled = true,
  deleteLabel,
  deletable,
  unarchiveLabel,
  onEdit,
  onDelete,
  onReorder,
  unarchivable,
  onUnarchive,
  unarchivePending = false,
}: {
  rowLabel: string;
  reorderLabel?: string;
  reorderEnabled?: boolean;
  deleteLabel: string;
  deletable: boolean;
  unarchiveLabel: string;
  onEdit: () => void;
  onDelete: () => void;
  onReorder?: () => void;
  unarchivable: boolean;
  onUnarchive: () => void;
  unarchivePending?: boolean;
}) {
  const reorderActionLabel = reorderLabel ?? "Reorder Siblings";
  const reorderActionUnavailableLabel = "Cannot reorder right now";
  const canReorder = reorderEnabled && !!onReorder;
  const resolvedReorderTooltipLabel = canReorder
    ? reorderActionLabel
    : reorderEnabled && !onReorder
      ? reorderActionUnavailableLabel
      : reorderActionLabel;

  return (
    <RowActionsMenu
      rowLabel={rowLabel}
      actions={[
        {
          id: "reorder",
          label: "Reorder Siblings",
          icon: <IconArrowsSort size={16} />,
          onClick: () => onReorder?.(),
          disabled: !canReorder,
          disabledReason: resolvedReorderTooltipLabel,
        },
        {
          id: "edit",
          label: "Edit",
          icon: <IconPencil size={16} />,
          onClick: onEdit,
        },
        {
          id: "delete",
          label: "Delete",
          icon: <IconTrash size={16} />,
          onClick: onDelete,
          color: "red",
          disabled: !deletable,
          disabledReason: deleteLabel,
          separatorBefore: true,
        },
        {
          id: "unarchive",
          label: "Unarchive",
          icon: <IconArchiveOff size={16} />,
          onClick: onUnarchive,
          color: "blue",
          disabled: !unarchivable || unarchivePending,
          disabledReason: unarchivePending ? "Unarchiving…" : unarchiveLabel,
        },
      ]}
    />
  );
}

export function ActiveAccountTreeActionsCell({
  rowLabel,
  addAccountLabel,
  onAddAccount,
  onAddGroup,
  archiveLabel,
  deleteLabel,
  archivable,
  deletable,
  reorderLabel,
  reorderEnabled = true,
  onEdit,
  onArchive,
  onDelete,
  onReorder,
}: {
  rowLabel: string;
  addAccountLabel?: string;
  onAddAccount?: () => void;
  onAddGroup?: () => void;
  archiveLabel: string;
  deleteLabel: string;
  archivable: boolean;
  deletable: boolean;
  reorderLabel?: string;
  reorderEnabled?: boolean;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onReorder?: () => void;
}) {
  const reorderActionLabel = reorderLabel ?? "Reorder Siblings";
  const reorderActionUnavailableLabel = "Cannot reorder right now";
  const canReorder = reorderEnabled && !!onReorder;
  const resolvedReorderTooltipLabel = canReorder
    ? reorderActionLabel
    : reorderEnabled && !onReorder
      ? reorderActionUnavailableLabel
      : reorderActionLabel;

  return (
    <RowActionsMenu
      rowLabel={rowLabel}
      actions={[
        {
          id: "reorder",
          label: "Reorder Siblings",
          icon: <IconArrowsSort size={16} />,
          onClick: () => onReorder?.(),
          disabled: !canReorder,
          disabledReason: resolvedReorderTooltipLabel,
        },
        {
          id: "edit",
          label: "Edit",
          icon: <IconPencil size={16} />,
          onClick: onEdit,
        },
        ...(onAddAccount && onAddGroup
          ? [
              {
                id: "add-account",
                label: addAccountLabel ?? "Add Account",
                icon: <IconPlus size={16} />,
                onClick: onAddAccount,
              },
              {
                id: "add-group",
                label: "Add Group",
                icon: <IconPlus size={16} />,
                onClick: onAddGroup,
              },
            ]
          : []),
        {
          id: "archive",
          label: "Archive",
          icon: <IconArchive size={16} />,
          onClick: onArchive,
          color: "yellow",
          disabled: !archivable,
          disabledReason: archiveLabel,
          separatorBefore: true,
        },
        {
          id: "delete",
          label: "Delete",
          icon: <IconTrash size={16} />,
          onClick: onDelete,
          color: "red",
          disabled: !deletable,
          disabledReason: deleteLabel,
        },
      ]}
    />
  );
}
