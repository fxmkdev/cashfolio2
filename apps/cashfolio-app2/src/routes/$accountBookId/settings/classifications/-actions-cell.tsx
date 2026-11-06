import {
  RowActionsMenu,
  type RowAction,
} from "@/components/grid/row-actions-menu";
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
  const actions: RowAction[] = [
    {
      id: "reorder",
      label: "Reorder Siblings",
      icon: <IconArrowsSort size={16} />,
      onClick: props.onReorder,
      disabled: !row.canReorder,
      disabledReason: "Cannot reorder because this row has no siblings",
    },
    {
      id: "edit",
      label: "Edit",
      icon: <IconPencil size={16} />,
      onClick: props.onEdit,
    },
    {
      id: "add-child",
      label: "Add Child",
      icon: <IconPlus size={16} />,
      onClick: props.onAddChild,
    },
    {
      id: "delete",
      label: "Delete",
      separatorBefore: true,
      icon: <IconTrash size={16} />,
      onClick: props.onDelete,
      disabled: row.hasChildren,
      disabledReason: "Move or delete child classes first",
      color: "red",
    },
  ];
  return <RowActionsMenu rowLabel={row.name} actions={actions} />;
}
