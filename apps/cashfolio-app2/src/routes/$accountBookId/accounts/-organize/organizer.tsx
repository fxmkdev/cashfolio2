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
  const [showArchived, setShowArchived] = useState(true);
  const [selectionNotice, setSelectionNotice] = useState("");
  const expansion = useRef(new Map<string, boolean>());
  const region = useRef<HTMLElement>(null);
  const [api, setApi] = useState<GridApi<OrganizeDisplayRow>>();
  const [selected, setSelected] = useState<OrganizeNodeRef[]>([]);
  const [dialogItems, setDialogItems] = useState<OrganizeNodeRef[]>();
  const nodes = useMemo(
    () => organizer.snapshot?.nodes ?? [],
    [organizer.snapshot],
  );
  const rows = useMemo(
    () => organizeDisplayRows(nodes, showArchived),
    [nodes, showArchived],
  );
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
    blocked: organizer.blocked,
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
        headerName: "Actions",
        width: 120,
        cellRenderer: ({ data }: ICellRendererParams<OrganizeDisplayRow>) =>
          data ? (
            <Button
              size="compact-xs"
              variant="subtle"
              aria-label={`Move ${data.name}`}
              disabled={organizer.blocked}
              onClick={() => setDialogItems([data])}
            >
              Move To…
            </Button>
          ) : null,
      },
    ],
    [organizer.blocked],
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
      className={organizer.blocked ? styles.blocked : undefined}
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
              disabled={!roots.length || organizer.blocked}
              onClick={() => setDialogItems(roots)}
            >
              Move To…
            </Button>
            <Button
              size="sm"
              variant="subtle"
              disabled={!selected.length || organizer.blocked}
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
            Drag to move or reorder. Groups move with all descendants. Changes
            save automatically.
          </Text>
        )}
        <Checkbox
          label="Show Archived"
          checked={showArchived}
          disabled={organizer.blocked || drag.dragging || !!dialogItems}
          onChange={(event) =>
            changeArchivedVisibility(event.currentTarget.checked)
          }
        />
      </Group>
      <MutationSubmitFeedback
        state={{ ...organizer.submitState, isWaiting: false }}
        onRefreshConstraints={organizer.refresh}
        onRetry={organizer.retry}
        retryDisabled={organizer.retryDisabled}
      />
      <Text size="sm" c="dimmed" mih={24} aria-live="polite">
        {drag.hint ||
          (organizer.pending
            ? organizer.submitState.isWaiting
              ? "Waiting for another change to finish…"
              : "Saving…"
            : organizer.message)}
      </Text>
      <VisuallyHidden role="status" aria-live="polite">
        Organize mode. {selectionNotice}{" "}
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
    </Box>
  );
}
