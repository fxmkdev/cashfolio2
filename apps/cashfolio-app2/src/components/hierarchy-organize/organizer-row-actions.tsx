import { getAccountConstraintMessage } from "@/shared/accounts/account-presentation";
import { ActionIcon, Group, Tooltip } from "@mantine/core";
import {
  IconArchive,
  IconArchiveOff,
  IconArrowsMove,
  IconTrash,
  IconPencil,
  IconPlus,
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
  onEdit,
  onAddChild,
  onAddGroup,
  addChildLabel,
}: {
  node: OrganizeNode;
  isCategory?: boolean;
  availability?: OrganizeActionAvailability;
  blocked: boolean;
  onMove: () => void;
  onArchive: () => void;
  onUnarchive: () => void;
  onDelete: () => void;
  onEdit?: () => void;
  onAddChild?: () => void;
  onAddGroup?: () => void;
  addChildLabel?: string;
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
      {[
        { label: "Edit", icon: <IconPencil size={16} />, onClick: onEdit },
        {
          label:
            addChildLabel ??
            (node.nodeType === "assetClass" ? "Add Child" : "Add Category"),
          icon: <IconPlus size={16} />,
          onClick: onAddChild,
        },
        {
          label: "Add Group",
          icon: <IconPlus size={16} />,
          onClick: onAddGroup,
        },
      ]
        .filter((action) => action.onClick)
        .map((action) => (
          <Tooltip key={action.label} label={action.label}>
            <span style={{ display: "inline-flex" }}>
              <ActionIcon
                variant="subtle"
                size="sm"
                color="blue"
                aria-label={`${action.label} ${node.name}`}
                disabled={blocked}
                onClick={action.onClick}
              >
                {action.icon}
              </ActionIcon>
            </span>
          </Tooltip>
        ))}
      {node.nodeType !== "assetClass" && (
        <Tooltip label={reason(statusReason) ?? statusAction}>
          <span style={{ display: "inline-flex" }}>
            <ActionIcon
              variant="subtle"
              size="sm"
              color={node.isActive ? "yellow" : "blue"}
              aria-label={`${statusAction} ${node.name}`}
              aria-description={reason(statusReason)}
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
            aria-description={reason(availability?.deleteDisabledReason)}
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
