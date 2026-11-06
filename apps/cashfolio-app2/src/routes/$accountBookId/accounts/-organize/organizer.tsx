import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Checkbox,
  Group,
  Text,
  VisuallyHidden,
} from "@mantine/core";
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
import {
  OrganizerLifecycleDialogs,
  type LifecycleDialog,
} from "./lifecycle-dialogs";
import { MutationSubmitFeedback } from "@/components/dialogs/mutation-submit-feedback";
import {
  normalizeOrganizeSelection,
  organizeDisplayRows,
  type OrganizeDisplayRow,
} from "@/shared/account-organize/tree";
import type { OrganizeNodeRef } from "@/shared/account-organize/types";
import { MoveDialog } from "./move-dialog";
import type { Organizer } from "./use-organizer";
import { useOrganizeDrag } from "./use-organize-drag";
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

export function AccountOrganizer({
  accountBookId,
  organizer,
}: {
  accountBookId: string;
  organizer: Organizer;
}) {
  const [showArchived, setShowArchived] = useState(false);
  const organizerRef = useRef(organizer);
  organizerRef.current = organizer;
  const [selectionNotice, setSelectionNotice] = useState("");
  const expansion = useRef(new Map<string, boolean>());
  const region = useRef<HTMLElement>(null);
  const [api, setApi] = useState<GridApi<OrganizeDisplayRow>>();
  const [selected, setSelected] = useState<OrganizeNodeRef[]>([]);
  const [dialogItems, setDialogItems] = useState<OrganizeNodeRef[]>();
  const [lifecycleDialog, setLifecycleDialog] = useState<LifecycleDialog>();
  const movementBlocked =
    organizer.blocked || !!dialogItems || !!lifecycleDialog;
  const nodes = useMemo(
    () => organizer.snapshot?.nodes ?? [],
    [organizer.snapshot],
  );
  const rows = useMemo(
    () => organizeDisplayRows(nodes, showArchived),
    [nodes, showArchived],
  );
  useEffect(() => {
    const visible = new Set(rows.map((row) => row.id));
    const retained = selected.filter((item) => visible.has(item.id));
    if (retained.length !== selected.length) {
      setSelected(retained);
      setSelectionNotice(
        `${selected.length - retained.length} unavailable or hidden items were deselected.`,
      );
    }
  }, [rows, selected]);
  const roots = useMemo(
    () =>
      normalizeOrganizeSelection(
        nodes,
        selected.filter((item) => nodes.some((node) => node.id === item.id)),
      ),
    [nodes, selected],
  );
  const drag = useOrganizeDrag({
    nodes,
    api,
    blocked: movementBlocked,
    saveMove: organizer.saveMove,
  });
  const reveal = useCallback(
    (id: string, focus: boolean) => {
      let node = api?.getRowNode(id);
      let current = nodes.find((item) => item.id === id);
      while (!node && current?.parentId) {
        current = nodes.find((item) => item.id === current?.parentId);
        if (current) node = api?.getRowNode(current.id);
      }
      if (!api || !node) return false;
      let parent = node.parent;
      while (parent && parent.level >= 0) {
        parent.setExpanded(true, undefined, true);
        parent = parent.parent;
      }
      api.ensureNodeVisible(node, "middle");
      if (focus && node.rowIndex !== null)
        api.setFocusedCell(node.rowIndex, "ag-Grid-AutoColumn");
      return true;
    },
    [api, nodes],
  );
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      for (const id of organizer.revealIds) reveal(id, false);
      if (
        organizer.revealIds.length &&
        !organizer.revealIds.some((id) => reveal(id, true))
      )
        region.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [organizer.revealIds, rows, reveal]);
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
              blocked={movementBlocked || drag.dragging}
              onMove={() => setDialogItems([data])}
              onArchive={() =>
                setLifecycleDialog({
                  action: "archive",
                  node: { ...data, parentId: data.parentId ?? null },
                })
              }
              onDelete={() =>
                setLifecycleDialog({
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
    [drag.dragging, movementBlocked, organizer.snapshot?.actionAvailability],
  );
  const groups = roots.filter(
    (node) => node.nodeType === "accountGroup",
  ).length;
  const accounts = roots.length - groups;
  const onGridReady = useCallback(
    ({ api }: GridReadyEvent<OrganizeDisplayRow>) => setApi(api),
    [],
  );
  const onSelectionChanged = useCallback(
    ({ api }: SelectionChangedEvent<OrganizeDisplayRow>) =>
      setSelected(api.getSelectedRows()),
    [],
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
  const changeArchivedVisibility = (value: boolean) => {
    if (!value) {
      const hidden = selected.filter(
        (item) => !nodes.find((node) => node.id === item.id)?.isActive,
      );
      for (const item of hidden) api?.getRowNode(item.id)?.setSelected(false);
      setSelected(
        selected.filter((item) => !hidden.some((node) => node.id === item.id)),
      );
      setSelectionNotice(
        hidden.length
          ? `${hidden.length} hidden archived ${hidden.length === 1 ? "item was" : "items were"} deselected.`
          : "",
      );
    } else setSelectionNotice("");
    setShowArchived(value);
  };
  const hiddenResults = organizer.revealIds.filter(
    (id) =>
      !showArchived && nodes.some((node) => node.id === id && !node.isActive),
  ).length;
  return (
    <Box
      ref={region}
      tabIndex={-1}
      component="section"
      aria-label="Organize Accounts"
      className={movementBlocked ? styles.blocked : undefined}
      data-account-book-id={accountBookId}
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
      }}
    >
      <Group justify="space-between" mb="sm" className={styles.selectionBar}>
        {selected.length ? (
          <Group role="toolbar" aria-label="Organize Account Actions" gap="xs">
            <Text size="sm" role="status">
              {groups} {groups === 1 ? "group" : "groups"} and {accounts}{" "}
              {accounts === 1 ? "account" : "accounts"} selected
            </Text>
            <Button
              size="sm"
              disabled={!roots.length || movementBlocked || drag.dragging}
              onClick={() => setDialogItems(roots)}
            >
              Move To…
            </Button>
            <Button
              size="sm"
              variant="subtle"
              disabled={!selected.length || movementBlocked || drag.dragging}
              onClick={() => {
                api?.deselectAll();
                setSelected([]);
              }}
            >
              Clear Selection
            </Button>
          </Group>
        ) : (
          <Text size="sm" c="dimmed" flex={1}>
            {drag.hint ||
              (organizer.pending
                ? organizer.submitState.isWaiting
                  ? "Waiting for another change to finish…"
                  : "Saving…"
                : organizer.message) ||
              "Drag to move or reorder. Groups move with all descendants. Changes save automatically."}
          </Text>
        )}
        <Group gap="sm">
          {selected.length > 0 && (
            <Text size="sm" c="dimmed" role="status">
              {drag.hint || (organizer.pending ? "Saving…" : organizer.message)}
            </Text>
          )}
          {hiddenResults > 0 && (
            <Text size="sm" c="dimmed">
              Affected archived items are hidden. Enable Show Archived to view
              them.
            </Text>
          )}
          <Checkbox
            label="Show Archived"
            checked={showArchived}
            disabled={movementBlocked || drag.dragging}
            onChange={(event) =>
              changeArchivedVisibility(event.currentTarget.checked)
            }
          />
        </Group>
      </Group>
      <MutationSubmitFeedback
        state={{ ...organizer.submitState, isWaiting: false }}
        onRefreshConstraints={organizer.refresh}
        onRetry={organizer.retry}
        retryDisabled={organizer.retryDisabled}
      />
      <VisuallyHidden role="status" aria-live="polite">
        Organize mode. {selectionNotice} {organizer.message}{" "}
        {hiddenResults > 0 &&
          `${hiddenResults} affected archived items are hidden. Enable Show Archived to view them.`}
      </VisuallyHidden>
      {!rows.length && (
        <Text size="sm" c="dimmed">
          {showArchived ? (
            "There are no accounts or groups to organize."
          ) : (
            <>
              There are no active accounts or groups.{" "}
              <Button
                variant="subtle"
                size="compact-sm"
                onClick={() => changeArchivedVisibility(true)}
              >
                Show Archived
              </Button>
            </>
          )}
        </Text>
      )}
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
      {dialogItems && (
        <MoveDialog
          nodes={nodes}
          showArchived={showArchived}
          items={dialogItems}
          pending={organizer.pending}
          onClose={() => setDialogItems(undefined)}
          onMove={organizer.saveMove}
        />
      )}
      <OrganizerLifecycleDialogs
        dialog={lifecycleDialog}
        organizer={organizer}
        onClose={() => setLifecycleDialog(undefined)}
      />
    </Box>
  );
}
