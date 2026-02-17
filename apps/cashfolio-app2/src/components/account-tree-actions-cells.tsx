import { ActionIcon, Group, Tooltip } from "@mantine/core";
import {
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
  onEdit,
  onArchive,
  onDelete,
}: {
  archiveLabel: string;
  deleteLabel: string;
  archivable: boolean;
  deletable: boolean;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  return (
    <Group gap={4} wrap="nowrap" h="100%" align="center">
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
