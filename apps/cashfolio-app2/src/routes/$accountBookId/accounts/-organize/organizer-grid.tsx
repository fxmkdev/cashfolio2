import { useCallback, useEffect, useMemo, useRef } from "react";
import { Badge } from "@mantine/core";
import type {
  ColDef,
  GridApi,
  GridOptions,
  GridReadyEvent,
  ICellRendererParams,
  SelectionChangedEvent,
} from "ag-grid-enterprise";
import { DataGrid } from "@/components/grid/data-grid";
import { OrganizeAccountActionsCell } from "@/components/account-tree/organize-account-actions-cell";
import type { OrganizeDisplayRow } from "@/shared/account-organize/tree";
import type { OrganizeNodeRef } from "@/shared/account-organize/types";
import type { Organizer } from "./use-organizer";
import type { useOrganizeDrag } from "./use-organize-drag";
import type { LifecycleDialog } from "./lifecycle-dialogs";
import styles from "./organizer.module.css";

// Hint updates must not reconfigure the tree column or recreate its controls.
const gridOptions: GridOptions<OrganizeDisplayRow> = {
  suppressNoRowsOverlay: true,
  defaultColDef: { sortable: false, filter: false, resizable: true },
  autoGroupColumnDef: {
    headerName: "Name",
    field: "name",
    flex: 1,
    minWidth: 280,
    rowDrag: ({ data }) => !!data,
    cellRendererParams: { suppressCount: true },
  },
  getRowId: ({ data }) => data.id,
  rowSelection: {
    mode: "multiRow",
    groupSelects: "self",
    headerCheckbox: false,
    enableClickSelection: false,
  },
  selectionColumnDef: { pinned: "left", width: 48, resizable: false },
};

export function OrganizerGrid({
  rows,
  api,
  organizer,
  drag,
  blocked,
  onGridReady,
  onSelectionChanged,
  onMoveItems,
  onLifecycle,
}: {
  rows: OrganizeDisplayRow[];
  api?: GridApi<OrganizeDisplayRow>;
  organizer: Organizer;
  drag: ReturnType<typeof useOrganizeDrag>;
  blocked: boolean;
  onGridReady: (event: GridReadyEvent<OrganizeDisplayRow>) => void;
  onSelectionChanged: (
    event: SelectionChangedEvent<OrganizeDisplayRow>,
  ) => void;
  onMoveItems: (items: OrganizeNodeRef[]) => void;
  onLifecycle: (dialog: LifecycleDialog) => void;
}) {
  const expansion = useRef(new Map<string, boolean>());
  const organizerRef = useRef(organizer);
  organizerRef.current = organizer;
  const callbacks = useRef({ onMoveItems, onLifecycle });
  callbacks.current = { onMoveItems, onLifecycle };
  const columnDefs = useMemo<ColDef<OrganizeDisplayRow>[]>(
    () => [
      {
        headerName: "Type",
        width: 135,
        valueGetter: ({ data }) =>
          data?.nodeType === "accountGroup" ? "Group" : "Account",
      },
      {
        headerName: "Status",
        width: 125,
        cellRenderer: ({ data }: ICellRendererParams<OrganizeDisplayRow>) =>
          data && !data.isActive ? (
            <Badge color="gray" variant="light">
              Archived
            </Badge>
          ) : null,
      },
      {
        colId: "actions",
        headerName: "",
        width: 120,
        pinned: "right",
        resizable: false,
        suppressHeaderMenuButton: true,
        cellClass: "actions-cell",
        cellRenderer: ({ data }: ICellRendererParams<OrganizeDisplayRow>) =>
          data ? (
            <OrganizeAccountActionsCell
              node={{ ...data, parentId: data.parentId ?? null }}
              availability={organizer.snapshot?.actionAvailability[data.id]}
              blocked={blocked || drag.dragging}
              onMove={() => callbacks.current.onMoveItems([data])}
              onArchive={() =>
                callbacks.current.onLifecycle({
                  action: "archive",
                  node: { ...data, parentId: data.parentId ?? null },
                })
              }
              onDelete={() =>
                callbacks.current.onLifecycle({
                  action: "delete",
                  node: { ...data, parentId: data.parentId ?? null },
                })
              }
              onUnarchive={() =>
                void organizerRef.current.submitState.runSubmit(() =>
                  organizerRef.current.performLifecycle("unarchive", data),
                )
              }
            />
          ) : null,
      },
    ],
    [drag.dragging, blocked, organizer.snapshot?.actionAvailability],
  );
  const rowClassRules = useMemo<
    GridOptions<OrganizeDisplayRow>["rowClassRules"]
  >(
    () => ({
      [styles.recent]: ({ data }) =>
        !!data && organizer.revealIds.includes(data.id),
      [styles.archived]: ({ data }) => !!data && !data.isActive,
    }),
    [organizer.revealIds],
  );
  const isGroupOpenByDefault = useCallback<
    NonNullable<GridOptions<OrganizeDisplayRow>["isGroupOpenByDefault"]>
  >(
    ({ rowNode }) => expansion.current.get(rowNode.id!) ?? rowNode.level === 0,
    [],
  );
  const onRowGroupOpened = useCallback<
    NonNullable<GridOptions<OrganizeDisplayRow>["onRowGroupOpened"]>
  >(({ node }) => {
    if (node.id) expansion.current.set(node.id, !!node.expanded);
  }, []);
  useEffect(() => {
    api?.forEachNode((node) => {
      const expanded = expansion.current.get(node.id!);
      if (node.group && expanded !== undefined && node.expanded !== expanded)
        node.setExpanded(expanded);
    });
  }, [api, rows]);
  return (
    <DataGrid
      {...gridOptions}
      containerStyle={{ flex: 1, minHeight: 200 }}
      rowData={rows}
      columnDefs={columnDefs}
      treeData
      treeDataParentIdField="parentId"
      groupDefaultExpanded={1}
      isGroupOpenByDefault={isGroupOpenByDefault}
      onRowGroupOpened={onRowGroupOpened}
      onGridReady={onGridReady}
      onSelectionChanged={onSelectionChanged}
      rowDragMultiRow
      rowDragManaged={false}
      suppressMoveWhenRowDragging
      rowDragText={drag.dragText}
      isRowValidDropPosition={drag.validateDrop}
      onRowDragEnter={drag.start}
      onRowDragEnd={drag.finish}
      onRowDragLeave={drag.leave}
      onRowDragCancel={drag.cancel}
      rowClassRules={rowClassRules}
    />
  );
}
