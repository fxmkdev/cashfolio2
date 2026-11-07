import { RowActionsMenu } from "@/components/grid/row-actions-menu";
import {
  IconArchive,
  IconArrowsMove,
  IconArchiveOff,
  IconPencil,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";

export function ArchivedAccountTreeActionsCell({
  rowLabel,
  deleteLabel,
  deletable,
  unarchiveLabel,
  onMove,
  onEdit,
  onDelete,
  unarchivable,
  onUnarchive,
  unarchivePending = false,
}: {
  rowLabel: string;
  deleteLabel: string;
  deletable: boolean;
  unarchiveLabel: string;
  onMove?: () => void;
  onEdit: () => void;
  onDelete: () => void;
  unarchivable: boolean;
  onUnarchive: () => void;
  unarchivePending?: boolean;
}) {
  return (
    <RowActionsMenu
      rowLabel={rowLabel}
      actions={[
        ...(onMove
          ? [
              {
                id: "move",
                label: "Move To…",
                icon: <IconArrowsMove size={16} />,
                onClick: onMove,
                color: "blue",
              },
            ]
          : []),
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
  onMove,
  onEdit,
  onArchive,
  onDelete,
}: {
  rowLabel: string;
  addAccountLabel?: string;
  onAddAccount?: () => void;
  onAddGroup?: () => void;
  archiveLabel: string;
  deleteLabel: string;
  archivable: boolean;
  deletable: boolean;
  onMove?: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  return (
    <RowActionsMenu
      rowLabel={rowLabel}
      actions={[
        ...(onMove
          ? [
              {
                id: "move",
                label: "Move To…",
                icon: <IconArrowsMove size={16} />,
                onClick: onMove,
                color: "blue",
              },
            ]
          : []),
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
