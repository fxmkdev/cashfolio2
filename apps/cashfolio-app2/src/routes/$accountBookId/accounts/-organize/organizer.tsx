import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Box,
  Button,
  Group,
  Loader,
  Text,
  TextInput,
  VisuallyHidden,
} from "@mantine/core";
import type { ColDef, GridApi, ICellRendererParams } from "ag-grid-enterprise";
import {
  IconArrowBackUp,
  IconArrowDown,
  IconArrowUp,
  IconSearch,
} from "@tabler/icons-react";
import { DataGrid } from "@/components/grid/data-grid";
import { MutationSubmitFeedback } from "@/components/dialogs/mutation-submit-feedback";
import {
  normalizeOrganizeSelection,
  organizeDisplayRows,
  organizePath,
  type OrganizeDisplayRow,
} from "@/shared/account-organize/tree";
import type { OrganizeNodeRef } from "@/shared/account-organize/types";
import { MoveDialog } from "./move-dialog";
import { useOrganizer, type OrganizerApi } from "./use-organizer";
import { useOrganizeDrag } from "./use-organize-drag";
import styles from "./organizer.module.css";

export function AccountOrganizer({
  accountBookId,
  onDone,
  onSaved,
  api: apiOverride,
}: {
  accountBookId: string;
  onDone: () => void;
  onSaved: () => void;
  api: OrganizerApi;
}) {
  const organizer = useOrganizer(onSaved, apiOverride);
  const [api, setApi] = useState<GridApi<OrganizeDisplayRow>>();
  const [selected, setSelected] = useState<OrganizeNodeRef[]>([]);
  const [dialogItems, setDialogItems] = useState<OrganizeNodeRef[]>();
  const [find, setFind] = useState("");
  const [matchIndex, setMatchIndex] = useState(0);
  const nodes = useMemo(
    () => organizer.snapshot?.nodes ?? [],
    [organizer.snapshot],
  );
  const rows = useMemo(() => organizeDisplayRows(nodes), [nodes]);
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
  const matches = useMemo(
    () =>
      find.trim()
        ? rows.filter(
            (row) =>
              !row.isVirtualArchivedGroup &&
              organizePath(nodes, row.id)
                .toLocaleLowerCase()
                .includes(find.trim().toLocaleLowerCase()),
          )
        : [],
    [find, rows, nodes],
  );
  const reveal = useCallback(
    (id: string, focus: boolean) => {
      const node = api?.getRowNode(id);
      if (!api || !node) return;
      let parent = node.parent;
      while (parent && parent.level >= 0) {
        parent.setExpanded(true, undefined, true);
        parent = parent.parent;
      }
      api.ensureNodeVisible(node, "middle");
      if (focus && node.rowIndex !== null)
        api.setFocusedCell(node.rowIndex, "ag-Grid-AutoColumn");
    },
    [api],
  );
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      for (const id of organizer.revealIds) reveal(id, false);
      if (organizer.revealIds[0]) reveal(organizer.revealIds[0], true);
    });
    return () => cancelAnimationFrame(frame);
  }, [organizer.revealIds, rows, reveal]);
  useEffect(() => {
    if (matches.length) reveal(matches[matchIndex % matches.length].id, false);
  }, [matches, matchIndex, reveal]);
  const columnDefs = useMemo<ColDef<OrganizeDisplayRow>[]>(
    () => [
      {
        headerName: "Type",
        width: 135,
        valueGetter: ({ data }) =>
          data?.isVirtualArchivedGroup
            ? ""
            : data?.nodeType === "accountGroup"
              ? "Group"
              : "Account",
      },
      {
        headerName: "Status",
        width: 125,
        cellRenderer: ({ data }: ICellRendererParams<OrganizeDisplayRow>) =>
          data && !data.isVirtualArchivedGroup && !data.isActive ? (
            <Badge color="gray" variant="light">
              Archived
            </Badge>
          ) : null,
      },
      {
        headerName: "Actions",
        width: 120,
        cellRenderer: ({ data }: ICellRendererParams<OrganizeDisplayRow>) =>
          data && !data.isVirtualArchivedGroup ? (
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
  return (
    <Box
      component="section"
      aria-label="Organize Accounts"
      data-account-book-id={accountBookId}
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
      }}
    >
      <Group justify="space-between" mb="sm">
        <Group role="toolbar" aria-label="Organize Account Actions" gap="xs">
          <Text size="sm">
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
          <Button
            size="sm"
            variant="default"
            leftSection={<IconArrowBackUp size={16} />}
            disabled={!organizer.undo || organizer.blocked}
            onClick={() => void organizer.undoMove()}
          >
            Undo
          </Button>
        </Group>
        <Button variant="default" disabled={organizer.pending} onClick={onDone}>
          Done
        </Button>
      </Group>
      <Text size="sm" c="dimmed" mb="sm">
        Select accounts or groups to move. Groups keep all descendants,
        including archived items. Changes save automatically.
      </Text>
      <MutationSubmitFeedback
        state={organizer.submitState}
        onRefreshConstraints={organizer.refresh}
        onRetry={organizer.retry}
        retryDisabled={organizer.retryDisabled}
      />
      {organizer.loading && <Loader size="sm" />}
      {organizer.loadError && (
        <Alert color="red">
          {organizer.loadError}
          <Button
            variant="subtle"
            onClick={() => void organizer.submitState.refreshConstraints()}
          >
            Refresh Choices
          </Button>
        </Alert>
      )}
      <Group mb="sm" gap="xs">
        <TextInput
          className={styles.find}
          aria-label="Find Accounts or Groups"
          placeholder="Find accounts or groups"
          leftSection={<IconSearch size={16} />}
          value={find}
          onChange={(event) => {
            setFind(event.currentTarget.value);
            setMatchIndex(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              setMatchIndex((value) =>
                matches.length
                  ? (value + (event.shiftKey ? matches.length - 1 : 1)) %
                    matches.length
                  : 0,
              );
            }
          }}
        />
        <Text size="sm" role="status">
          {matches.length
            ? `${(matchIndex % matches.length) + 1} of ${matches.length}`
            : find
              ? "No matches"
              : ""}
        </Text>
        <Button
          variant="default"
          size="sm"
          aria-label="Previous Match"
          disabled={!matches.length}
          onClick={() =>
            setMatchIndex(
              (value) => (value + matches.length - 1) % matches.length,
            )
          }
        >
          <IconArrowUp size={16} />
        </Button>
        <Button
          variant="default"
          size="sm"
          aria-label="Next Match"
          disabled={!matches.length}
          onClick={() => setMatchIndex((value) => (value + 1) % matches.length)}
        >
          <IconArrowDown size={16} />
        </Button>
      </Group>
      <Box
        ref={drag.rootRef}
        className={styles.rootTarget}
        mb="sm"
        aria-label="Top Level Drop Target"
      >
        <Text size="sm">
          Top Level — drop here to move items out of their groups
        </Text>
      </Box>
      <Text size="sm" c="dimmed" mih={24} aria-live="polite">
        {drag.hint}
      </Text>
      <VisuallyHidden role="status" aria-live="polite">
        {organizer.message}
      </VisuallyHidden>
      <DataGrid
        containerStyle={{ flex: 1, minHeight: 200 }}
        rowData={rows}
        columnDefs={columnDefs}
        defaultColDef={{ sortable: false, filter: false, resizable: true }}
        autoGroupColumnDef={{
          headerName: "Name",
          field: "name",
          flex: 1,
          minWidth: 280,
          rowDrag: ({ data }) => !!data && !data.isVirtualArchivedGroup,
          cellRendererParams: { suppressCount: true },
        }}
        treeData
        treeDataParentIdField="parentId"
        getRowId={({ data }) => data.id}
        groupDefaultExpanded={1}
        isGroupOpenByDefault={({ rowNode }) =>
          !rowNode.data?.isVirtualArchivedGroup && rowNode.level === 0
        }
        rowSelection={{
          mode: "multiRow",
          groupSelects: "self",
          headerCheckbox: false,
          enableClickSelection: false,
          isRowSelectable: (node) => !node.data?.isVirtualArchivedGroup,
          checkboxes: ({ data }) => !!data && !data.isVirtualArchivedGroup,
        }}
        selectionColumnDef={{ pinned: "left", width: 48, resizable: false }}
        onGridReady={({ api: readyApi }) => setApi(readyApi)}
        onSelectionChanged={({ api: gridApi }) =>
          setSelected(
            gridApi
              .getSelectedRows()
              .filter((row) => !row.isVirtualArchivedGroup),
          )
        }
        rowDragMultiRow
        rowDragManaged={false}
        suppressMoveWhenRowDragging
        suppressRowDrag={organizer.blocked}
        rowDragText={drag.dragText}
        isRowValidDropPosition={drag.validateDrop}
        onRowDragEnter={drag.start}
        onRowDragEnd={drag.finish}
        onRowDragLeave={drag.leave}
        onRowDragCancel={drag.cancel}
        rowClassRules={{
          [styles.match]: ({ data }) =>
            !!data && matches.some((match) => match.id === data.id),
          [styles.recent]: ({ data }) =>
            !!data && organizer.revealIds.includes(data.id),
        }}
      />
      {dialogItems && (
        <MoveDialog
          nodes={nodes}
          items={dialogItems}
          pending={organizer.pending}
          onClose={() => setDialogItems(undefined)}
          onMove={organizer.saveMove}
        />
      )}
    </Box>
  );
}
