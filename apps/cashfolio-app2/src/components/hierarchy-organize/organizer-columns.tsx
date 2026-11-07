import { useMemo, useRef } from "react";
import { Badge } from "@mantine/core";
import type { ColDef, ICellRendererParams } from "ag-grid-enterprise";
import { rowActionsColumnProps } from "@/components/grid/row-actions-menu";
import type { OrganizeDisplayRow } from "@/shared/hierarchy-organize/tree";
import type {
  OrganizeNode,
  OrganizeNodeRef,
  OrganizeActionAvailability,
} from "@/shared/hierarchy-organize/types";
import { OrganizerRowActions } from "./organizer-row-actions";
import type { Organizer } from "./use-organizer";
import type { HierarchyManagement, HierarchyCreation } from "./management";
import type { LifecycleDialog } from "./lifecycle-dialogs";

type ColumnOptions = {
  organizer: Organizer;
  blocked: boolean;
  management?: HierarchyManagement;
  creation?: HierarchyCreation;
  onMoveItems: (items: OrganizeNodeRef[]) => void;
  onLifecycle: (dialog: LifecycleDialog) => void;
};

function statusColumns(kind: Organizer["kind"]): ColDef<OrganizeDisplayRow>[] {
  if (kind === "assetClasses") return [];
  return [
    {
      headerName: "Type",
      width: 135,
      valueGetter: ({ data }) =>
        data?.nodeType === "accountGroup"
          ? "Group"
          : kind === "categories"
            ? "Category"
            : "Account",
    },
    {
      headerName: "Status",
      width: 125,
      cellRenderer: ({ data }: ICellRendererParams<OrganizeDisplayRow>) =>
        data?.isActive === false ? (
          <Badge color="gray" variant="light">
            Archived
          </Badge>
        ) : null,
    },
  ];
}

function OrganizerActionsCell({
  node,
  kind,
  availability,
  blocked,
  management,
  creation,
  onMoveItems,
  onLifecycle,
  onUnarchive,
}: Omit<ColumnOptions, "organizer"> & {
  node: OrganizeNode;
  kind: Organizer["kind"];
  availability?: OrganizeActionAvailability;
  onUnarchive: () => void;
}) {
  const canAddChild =
    node.nodeType === "assetClass" ||
    (node.nodeType === "accountGroup" && node.isActive);
  return (
    <OrganizerRowActions
      node={node}
      isCategory={kind === "categories"}
      availability={availability}
      blocked={blocked}
      onMove={() => onMoveItems([node])}
      addChildLabel={creation ? "Add Account" : management?.addChildLabel}
      onEdit={management ? () => management.onEdit(node) : undefined}
      onAddChild={
        (management || creation) && canAddChild
          ? () => (creation ?? management)?.onAddChild(node)
          : undefined
      }
      onAddGroup={
        (creation?.onAddGroup || management?.onAddGroup) &&
        node.nodeType === "accountGroup" &&
        node.isActive
          ? () => (creation ?? management)?.onAddGroup?.(node)
          : undefined
      }
      onArchive={() => onLifecycle({ action: "archive", node })}
      onDelete={() => onLifecycle({ action: "delete", node })}
      onUnarchive={onUnarchive}
    />
  );
}

export function useOrganizerColumns({
  organizer,
  blocked,
  management,
  creation,
  onMoveItems,
  onLifecycle,
}: ColumnOptions) {
  // Read current callbacks without rebuilding columns for selection or drag hints.
  const current = useRef({
    organizer,
    onMoveItems,
    onLifecycle,
  });
  current.current = {
    organizer,
    onMoveItems,
    onLifecycle,
  };
  const width = creation
    ? 176
    : management
      ? organizer.kind === "categories"
        ? 200
        : 144
      : 120;
  return useMemo<ColDef<OrganizeDisplayRow>[]>(
    () => [
      ...(management?.columns ?? []),
      ...statusColumns(organizer.kind),
      {
        ...rowActionsColumnProps,
        colId: "actions",
        width,
        minWidth: width,
        maxWidth: width,
        pinned: "right",
        cellRenderer: ({ data }: ICellRendererParams<OrganizeDisplayRow>) =>
          data ? (
            <OrganizerActionsCell
              node={{ ...data, parentId: data.parentId ?? null }}
              kind={organizer.kind}
              availability={organizer.snapshot?.actionAvailability[data.id]}
              blocked={blocked}
              management={management}
              creation={creation}
              onMoveItems={(items) => current.current.onMoveItems(items)}
              onLifecycle={(dialog) => current.current.onLifecycle(dialog)}
              onUnarchive={() =>
                void current.current.organizer.submitState.runSubmit(() =>
                  current.current.organizer.performLifecycle("unarchive", data),
                )
              }
            />
          ) : null,
      },
    ],
    [
      blocked,
      organizer.kind,
      organizer.snapshot?.actionAvailability,
      management,
      creation,
      width,
    ],
  );
}
