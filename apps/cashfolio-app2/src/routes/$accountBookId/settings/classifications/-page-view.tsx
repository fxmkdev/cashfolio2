import { Button, Group, Stack, Text } from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import type { ColDef, ICellRendererParams } from "ag-grid-enterprise";
import { useMemo, useState } from "react";
import { DataGrid } from "@/components/grid/data-grid";
import { ReorderGroupChildrenModal } from "@/components/account-tree/reorder-group-children-modal";
import {
  ClassDialog,
  type ManagedClass,
  type ClassDraft,
} from "./-class-dialog";
import { AssetClassActionsCell } from "./-actions-cell";
import { buildAssetClassGridRows, type AssetClassGridRow } from "./-grid-rows";

const EMPTY_MESSAGE =
  "No asset classes. Create one to start classifying accounts.";
const GRID_LOCALE_TEXT = { noRowsToShow: EMPTY_MESSAGE };
const DEFAULT_COL_DEF: ColDef<AssetClassGridRow> = {
  resizable: true,
  sortable: false,
  filter: false,
  suppressMovable: true,
};
const NAME_COLUMN: ColDef<AssetClassGridRow> = {
  headerName: "Asset Class",
  field: "name",
  flex: 1,
  minWidth: 280,
  tooltipField: "path",
  cellRendererParams: { suppressCount: true },
};

export function ClassificationsPageView(props: {
  nodes: ManagedClass[];
  onSave: (draft: ClassDraft) => Promise<void>;
  onReorder: (parentId: string | null, orderedIds: string[]) => Promise<void>;
  onDelete: (id: string, replacementId: string | null) => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const [dialog, setDialog] = useState<{
    draft: ClassDraft;
    deleting?: boolean;
  } | null>(null);
  const [reorderingRow, setReorderingRow] = useState<ManagedClass | null>(null);
  const rows = useMemo(
    () => buildAssetClassGridRows(props.nodes),
    [props.nodes],
  );
  const siblingRows = useMemo(
    () =>
      reorderingRow
        ? rows
            .filter((row) => row.parentId === reorderingRow.parentId)
            .map((row) => ({
              id: row.id,
              name: row.name,
              nodeType: "assetClass" as const,
            }))
        : [],
    [rows, reorderingRow],
  );
  const columns = useMemo<ColDef<AssetClassGridRow>[]>(
    () => [
      {
        colId: "accounts",
        headerName: "Accounts",
        width: 230,
        minWidth: 210,
        valueGetter: ({ data }) =>
          data
            ? `${data.activeCount} active, ${data.archivedCount} archived`
            : "",
      },
      {
        colId: "actions",
        headerName: "Actions",
        pinned: "right",
        width: 180,
        minWidth: 160,
        cellClass: "actions-cell",
        cellRenderer: ({ data }: ICellRendererParams<AssetClassGridRow>) =>
          data ? (
            <AssetClassActionsCell
              row={data}
              onEdit={() => setDialog({ draft: data })}
              onAddChild={() =>
                setDialog({ draft: { name: "", parentId: data.id } })
              }
              onReorder={() => setReorderingRow(data)}
              onDelete={() => setDialog({ draft: data, deleting: true })}
            />
          ) : null,
      },
    ],
    [],
  );
  return (
    <Stack flex={1} mih={0}>
      <Group justify="end">
        <Button
          leftSection={<IconPlus size={16} />}
          onClick={() => setDialog({ draft: { name: "", parentId: null } })}
        >
          New Asset Class
        </Button>
      </Group>
      <Text size="sm" c="dimmed">
        Organize asset classes for gain/loss reports. Accounts can be assigned
        to any level. Changes apply to all historical periods.
      </Text>
      <DataGrid
        containerStyle={{ flex: 1, minHeight: 0 }}
        rowData={rows}
        columnDefs={columns}
        defaultColDef={DEFAULT_COL_DEF}
        autoGroupColumnDef={NAME_COLUMN}
        treeData
        treeDataParentIdField="parentId"
        groupDefaultExpanded={-1}
        getRowId={({ data }) => data.id}
        onGridReady={({ api }) =>
          api.setGridAriaProperty("label", "Asset Classes")
        }
        localeText={GRID_LOCALE_TEXT}
      />
      <Text size="sm" c="dimmed">
        Accounts without an assignment appear as Unclassified.
      </Text>
      <ReorderGroupChildrenModal
        opened={!!reorderingRow}
        onClose={() => setReorderingRow(null)}
        rowName={reorderingRow?.name ?? ""}
        initialRows={siblingRows}
        onRefreshConstraints={props.onRefresh}
        onReorder={(ordered) =>
          reorderingRow
            ? props.onReorder(
                reorderingRow.parentId,
                ordered.map((row) => row.id),
              )
            : Promise.resolve()
        }
      />
      {dialog && (
        <ClassDialog
          {...dialog}
          nodes={props.nodes}
          onClose={() => setDialog(null)}
          onRefresh={props.onRefresh}
          onSave={props.onSave}
          onDelete={props.onDelete}
        />
      )}
    </Stack>
  );
}
