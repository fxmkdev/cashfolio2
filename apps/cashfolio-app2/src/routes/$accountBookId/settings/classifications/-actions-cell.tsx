import { ActionIcon, Group, Tooltip } from "@mantine/core";
import {
  IconArrowsSort,
  IconPencil,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import type { AssetClassGridRow } from "./-grid-rows";

export function AssetClassActionsCell(props: {
  row: AssetClassGridRow;
  onEdit: () => void;
  onAddChild: () => void;
  onReorder: () => void;
  onDelete: () => void;
}) {
  const { row } = props;
  const actions = [
    {
      label: "Reorder Siblings",
      icon: IconArrowsSort,
      onClick: props.onReorder,
      disabled: !row.canReorder,
      reason: "Cannot reorder because this row has no siblings",
    },
    { label: `Edit ${row.name}`, icon: IconPencil, onClick: props.onEdit },
    {
      label: `Add Child to ${row.name}`,
      icon: IconPlus,
      onClick: props.onAddChild,
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
