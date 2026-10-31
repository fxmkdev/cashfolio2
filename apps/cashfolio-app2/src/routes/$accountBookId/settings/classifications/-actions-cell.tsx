import { ActionIcon, Group, Tooltip } from "@mantine/core";
import {
  IconArrowDown,
  IconArrowUp,
  IconEdit,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import type { AssetClassGridRow } from "./-grid-rows";

export function AssetClassActionsCell(props: {
  row: AssetClassGridRow;
  isMoving: boolean;
  onEdit: () => void;
  onAddChild: () => void;
  onMove: (direction: "up" | "down") => void;
  onDelete: () => void;
}) {
  const { row } = props;
  const actions = [
    { label: `Edit ${row.name}`, icon: IconEdit, onClick: props.onEdit },
    {
      label: `Add Child to ${row.name}`,
      icon: IconPlus,
      onClick: props.onAddChild,
    },
    {
      label: `Move ${row.name} Up`,
      icon: IconArrowUp,
      onClick: () => props.onMove("up"),
      disabled: !row.canMoveUp || props.isMoving,
      reason: props.isMoving
        ? "An ordering change is in progress"
        : "This is the first class at this level",
    },
    {
      label: `Move ${row.name} Down`,
      icon: IconArrowDown,
      onClick: () => props.onMove("down"),
      disabled: !row.canMoveDown || props.isMoving,
      reason: props.isMoving
        ? "An ordering change is in progress"
        : "This is the last class at this level",
    },
    {
      label: `Delete ${row.name}`,
      icon: IconTrash,
      onClick: props.onDelete,
      disabled: row.hasChildren,
      reason: "Move or delete child classes first",
      color: "red",
    },
  ];
  return (
    <Group gap={4} wrap="nowrap" h="100%" align="center">
      {actions.map(
        ({ label, icon: Icon, onClick, disabled, reason, color }) => (
          <Tooltip key={label} label={disabled ? reason : label}>
            <span style={{ display: "inline-flex" }}>
              <ActionIcon
                variant="subtle"
                size="sm"
                aria-label={label}
                disabled={disabled}
                color={color}
                onClick={onClick}
              >
                <Icon size={16} />
              </ActionIcon>
            </span>
          </Tooltip>
        ),
      )}
    </Group>
  );
}
