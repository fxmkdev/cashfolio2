import { ActionIcon, Group, Tooltip } from "@mantine/core";
import {
  IconArrowsSort,
  IconArchive,
  IconArchiveOff,
  IconPencil,
  IconTrash,
} from "@tabler/icons-react";

export function ArchivedAccountTreeActionsCell({
  unarchiveLabel,
  unarchivable,
  onUnarchive,
}: {
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
        >
          <IconArchiveOff size={16} />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}

export function ActiveAccountTreeActionsCell({
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
        >
          <IconTrash size={16} />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}
