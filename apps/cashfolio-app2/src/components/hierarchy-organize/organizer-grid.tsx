import { useCallback, useEffect, useMemo, useRef } from "react";
import { Badge } from "@mantine/core";
import type {
  ColDef,
  GridApi,
  GridOptions,
  GridReadyEvent,
  ICellRendererParams,
  SelectionChangedEvent,
  ValueGetterParams,
} from "ag-grid-enterprise";
import { DataGrid } from "@/components/grid/data-grid";
import { rowActionsColumnProps } from "@/components/grid/row-actions-menu";
import { OrganizerRowActions } from "@/components/hierarchy-organize/organizer-row-actions";
import type { OrganizeDisplayRow } from "@/shared/hierarchy-organize/tree";
import type { OrganizeNodeRef } from "@/shared/hierarchy-organize/types";
import type { Organizer } from "./use-organizer";
import type { useOrganizeDrag } from "./use-organize-drag";
import type { LifecycleDialog } from "./lifecycle-dialogs";
import styles from "./organizer.module.css";
import type { HierarchyManagement } from "./management";

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
  management,
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
  management?: HierarchyManagement;
}) {
  const expansion = useRef(new Map<string, boolean>());
  const organizerRef = useRef(organizer);
  organizerRef.current = organizer;
  const callbacks = useRef({ onMoveItems, onLifecycle });
  const managementRef = useRef(management);
  managementRef.current = management;
  callbacks.current = { onMoveItems, onLifecycle };
  const columnDefs = useMemo<ColDef<OrganizeDisplayRow>[]>(
    () => [
      ...(management?.columns ?? []),
      ...(organizer.kind === "assetClasses"
        ? []
        : ([
            {
              headerName: "Type",
              width: 135,
              valueGetter: ({ data }: ValueGetterParams<OrganizeDisplayRow>) =>
                data?.nodeType === "accountGroup"
                  ? "Group"
                  : organizer.kind === "categories"
                    ? "Category"
                    : "Account",
            },
            {
              headerName: "Status",
              width: 125,
              cellRenderer: ({
                data,
              }: ICellRendererParams<OrganizeDisplayRow>) =>
                data && data.isActive === false ? (
                  <Badge color="gray" variant="light">
                    Archived
                  </Badge>
                ) : null,
            },
          ] satisfies ColDef<OrganizeDisplayRow>[])),
      {
        ...rowActionsColumnProps,
        colId: "actions",
        width: management ? (organizer.kind === "categories" ? 200 : 144) : 120,
        minWidth: management
          ? organizer.kind === "categories"
            ? 200
            : 144
          : 120,
        maxWidth: management
          ? organizer.kind === "categories"
            ? 200
            : 144
          : 120,
        pinned: "right",
        cellRenderer: ({ data }: ICellRendererParams<OrganizeDisplayRow>) =>
          data ? (
            <OrganizerRowActions
              isCategory={organizer.kind === "categories"}
              node={{ ...data, parentId: data.parentId ?? null }}
              availability={organizer.snapshot?.actionAvailability[data.id]}
              blocked={blocked || drag.dragging}
              onMove={() => callbacks.current.onMoveItems([data])}
              addChildLabel={management?.addChildLabel}
              onEdit={
                management
                  ? () =>
                      managementRef.current?.onEdit({
                        ...data,
                        parentId: data.parentId ?? null,
                      })
                  : undefined
              }
              onAddChild={
                management &&
                (data.nodeType === "assetClass" ||
                  (data.nodeType === "accountGroup" && data.isActive))
                  ? () =>
                      managementRef.current?.onAddChild({
                        ...data,
                        parentId: data.parentId ?? null,
                      })
                  : undefined
              }
              onAddGroup={
                management?.onAddGroup &&
                data.nodeType === "accountGroup" &&
                data.isActive
                  ? () =>
                      managementRef.current?.onAddGroup?.({
                        ...data,
                        parentId: data.parentId ?? null,
                      })
                  : undefined
              }
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
    [
      drag.dragging,
      blocked,
      organizer.snapshot?.actionAvailability,
      organizer.kind,
      management,
    ],
  );
  const rowClassRules = useMemo<
    GridOptions<OrganizeDisplayRow>["rowClassRules"]
  >(
    () => ({
      [styles.recent]: ({ data }) =>
        !!data && organizer.revealIds.includes(data.id),
      [styles.archived]: ({ data }) => !!data && data.isActive === false,
    }),
    [organizer.revealIds],
  );
  const isGroupOpenByDefault = useCallback<
    NonNullable<GridOptions<OrganizeDisplayRow>["isGroupOpenByDefault"]>
  >(
    (params) =>
      expansion.current.get(params.rowNode.id!) ??
      managementRef.current?.expansion?.isGroupOpenByDefault(params) ??
      (managementRef.current && organizerRef.current.kind === "assetClasses"
        ? true
        : params.rowNode.level === 0),
    [],
  );
  const onRowGroupOpened = useCallback<
    NonNullable<GridOptions<OrganizeDisplayRow>["onRowGroupOpened"]>
  >((event) => {
    const { node } = event;
    if (node.id) expansion.current.set(node.id, !!node.expanded);
    managementRef.current?.expansion?.onRowGroupOpened(event);
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
      onGridReady={(event) => {
        if (management)
          event.api.setGridAriaProperty(
            "label",
            organizer.kind === "categories" ? "Categories" : "Asset Classes",
          );
        onGridReady(event);
      }}
      onRowDoubleClicked={({ data, event }) => {
        if (
          blocked ||
          !data ||
          data.nodeType !== "account" ||
          (event?.target instanceof Element &&
            event.target.closest(".actions-cell"))
        )
          return;
        managementRef.current?.onOpenLeaf?.(data.id);
      }}
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
