import { getAccountConstraintMessage } from "@/shared/account-presentation";
import { ActionIcon, Group, Tooltip } from "@mantine/core";
import {
  IconArchive,
  IconArchiveOff,
  IconArrowsMove,
  IconTrash,
} from "@tabler/icons-react";
import type {
  OrganizeActionAvailability,
  OrganizeNode,
} from "@/shared/hierarchy-organize/types";

export function OrganizerRowActions({
  node,
  isCategory = false,
  availability,
  blocked,
  onMove,
  onArchive,
  onUnarchive,
  onDelete,
}: {
  node: OrganizeNode;
  isCategory?: boolean;
  availability?: OrganizeActionAvailability;
  blocked: boolean;
  onMove: () => void;
  onArchive: () => void;
  onUnarchive: () => void;
  onDelete: () => void;
}) {
  const reason = (message?: string) =>
    getAccountConstraintMessage(
      message,
      isCategory ? "categories" : "accounts",
    );
  const statusAction = node.isActive ? "Archive" : "Unarchive";
  const statusEnabled = node.isActive
    ? availability?.archivable
    : availability?.unarchivable;
  const statusReason = node.isActive
    ? availability?.archiveDisabledReason
    : availability?.unarchiveDisabledReason;
  return (
    <Group gap={4} wrap="nowrap" h="100%" align="center">
      <Tooltip label="Move To…">
        <span style={{ display: "inline-flex" }}>
          <ActionIcon
            variant="subtle"
            size="sm"
            color="blue"
            aria-label={`Move ${node.name}`}
            disabled={blocked}
            onClick={onMove}
          >
            <IconArrowsMove size={16} />
          </ActionIcon>
        </span>
      </Tooltip>
      {node.nodeType !== "assetClass" && (
        <Tooltip label={reason(statusReason) ?? statusAction}>
          <span style={{ display: "inline-flex" }}>
            <ActionIcon
              variant="subtle"
              size="sm"
              color={node.isActive ? "yellow" : "blue"}
              aria-label={`${statusAction} ${node.name}`}
              disabled={blocked || !statusEnabled}
              onClick={node.isActive ? onArchive : onUnarchive}
            >
              {node.isActive ? (
                <IconArchive size={16} />
              ) : (
                <IconArchiveOff size={16} />
              )}
            </ActionIcon>
          </span>
        </Tooltip>
      )}
      <Tooltip label={reason(availability?.deleteDisabledReason) ?? "Delete"}>
        <span style={{ display: "inline-flex" }}>
          <ActionIcon
            variant="subtle"
            size="sm"
            color="red"
            aria-label={`Delete ${node.name}`}
            disabled={blocked || !availability?.deletable}
            onClick={onDelete}
          >
            <IconTrash size={16} />
          </ActionIcon>
        </span>
      </Tooltip>
    </Group>
  );
}
