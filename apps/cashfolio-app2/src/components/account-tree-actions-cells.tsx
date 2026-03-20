import { ActionIcon, Group, Tooltip } from "@mantine/core";
import {
  IconArrowsSort,
  IconArchive,
  IconArchiveOff,
  IconPencil,
  IconTrash,
} from "@tabler/icons-react";

export function ArchivedAccountTreeActionsCell({
  rowId,
  unarchiveLabel,
  unarchivable,
  onUnarchive,
}: {
  rowId?: string;
  unarchiveLabel: string;
  unarchivable: boolean;
  onUnarchive: () => void;
}) {
  return (
    <Group gap={4} wrap="nowrap" h="100%" align="center">
      <Tooltip label={unarchiveLabel}>
        <ActionIcon
          variant="subtle"
          size="sm"
          color="blue"
          disabled={!unarchivable}
          onClick={onUnarchive}
          aria-label="Unarchive"
          data-testid={
            rowId ? `account-tree-unarchive-${rowId}` : "account-tree-unarchive"
          }
        >
          <IconArchiveOff size={16} />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}

export function ActiveAccountTreeActionsCell({
  rowId,
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
  rowId?: string;
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
  return (
    <Group gap={4} wrap="nowrap" h="100%" align="center">
      <Tooltip label={reorderLabel ?? "Reorder siblings"}>
        <ActionIcon
          variant="subtle"
          size="sm"
          disabled={!reorderEnabled}
          onClick={onReorder}
          aria-label="Reorder siblings"
          data-testid={
            rowId ? `account-tree-reorder-${rowId}` : "account-tree-reorder"
          }
        >
          <IconArrowsSort size={16} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Edit">
        <ActionIcon
          variant="subtle"
          size="sm"
          onClick={onEdit}
          aria-label="Edit"
          data-testid={
            rowId ? `account-tree-edit-${rowId}` : "account-tree-edit"
          }
        >
          <IconPencil size={16} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label={archiveLabel}>
        <ActionIcon
          variant="subtle"
          size="sm"
          color="yellow"
          disabled={!archivable}
          onClick={onArchive}
          aria-label="Archive"
          data-testid={
            rowId ? `account-tree-archive-${rowId}` : "account-tree-archive"
          }
        >
          <IconArchive size={16} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label={deleteLabel}>
        <ActionIcon
          variant="subtle"
          size="sm"
          color="red"
          disabled={!deletable}
          onClick={onDelete}
          aria-label="Delete"
          data-testid={
            rowId ? `account-tree-delete-${rowId}` : "account-tree-delete"
          }
        >
          <IconTrash size={16} />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}
