import { ActionIcon, Group, Tooltip } from "@mantine/core";
import {
  IconArrowsSort,
  IconArchive,
  IconArchiveOff,
  IconPencil,
  IconTrash,
} from "@tabler/icons-react";

const TOOLTIP_TRIGGER_STYLE = { display: "inline-flex" } as const;

export function ArchivedAccountTreeActionsCell({
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
}: {
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
}) {
  const reorderActionLabel = reorderLabel ?? "Reorder siblings";
  const reorderActionUnavailableLabel = "Cannot reorder right now";
  const canReorder = reorderEnabled && !!onReorder;
  const resolvedReorderTooltipLabel = canReorder
    ? reorderActionLabel
    : reorderEnabled && !onReorder
      ? reorderActionUnavailableLabel
      : reorderActionLabel;

  return (
    <Group gap={4} wrap="nowrap" h="100%" align="center">
      <Tooltip label={resolvedReorderTooltipLabel}>
        <span style={TOOLTIP_TRIGGER_STYLE}>
          <ActionIcon
            variant="subtle"
            size="sm"
            disabled={!canReorder}
            onClick={onReorder}
            aria-label="Reorder siblings"
          >
            <IconArrowsSort size={16} />
          </ActionIcon>
        </span>
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
      <Tooltip label={deleteLabel}>
        <span style={TOOLTIP_TRIGGER_STYLE}>
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
        </span>
      </Tooltip>
      <Tooltip label={unarchiveLabel}>
        <span style={TOOLTIP_TRIGGER_STYLE}>
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
        </span>
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
  const reorderActionLabel = reorderLabel ?? "Reorder siblings";
  const reorderActionUnavailableLabel = "Cannot reorder right now";
  const canReorder = reorderEnabled && !!onReorder;
  const resolvedReorderTooltipLabel = canReorder
    ? reorderActionLabel
    : reorderEnabled && !onReorder
      ? reorderActionUnavailableLabel
      : reorderActionLabel;

  return (
    <Group gap={4} wrap="nowrap" h="100%" align="center">
      <Tooltip label={resolvedReorderTooltipLabel}>
        <span style={TOOLTIP_TRIGGER_STYLE}>
          <ActionIcon
            variant="subtle"
            size="sm"
            disabled={!canReorder}
            onClick={onReorder}
            aria-label="Reorder siblings"
          >
            <IconArrowsSort size={16} />
          </ActionIcon>
        </span>
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
        <span style={TOOLTIP_TRIGGER_STYLE}>
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
        </span>
      </Tooltip>
      <Tooltip label={deleteLabel}>
        <span style={TOOLTIP_TRIGGER_STYLE}>
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
        </span>
      </Tooltip>
    </Group>
  );
}
