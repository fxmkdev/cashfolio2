import { rowActionsColumnProps } from "@/components/grid/row-actions-menu";
import { Alert, Badge, Box, Button, Group, Stack, Text } from "@mantine/core";
import { IconArrowsMove, IconPlus } from "@tabler/icons-react";
import type { ColDef, ICellRendererParams } from "ag-grid-enterprise";
import { useMemo, useState } from "react";
import { DataGrid } from "@/components/grid/data-grid";
import { HierarchyOrganizer } from "@/components/hierarchy-organize/organizer";
import { OrganizerActions } from "@/components/hierarchy-organize/organizer-actions";
import { useOrganizeSession } from "@/components/hierarchy-organize/use-organize-session";
import type { OrganizerApi } from "@/components/hierarchy-organize/use-organizer";
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

type ClassificationsPageProps = {
  accountBookId?: string;
  organize?: boolean;
  organizerApi?: OrganizerApi;
  nodes: ManagedClass[];
  onSave: (draft: ClassDraft) => Promise<void>;
  onDelete: (id: string, replacementId: string | null) => Promise<void>;
  onRefresh: () => Promise<void>;
};
export function ClassificationsPageView(props: ClassificationsPageProps) {
  return <ClassificationsPageContent key={props.accountBookId} {...props} />;
}
function ClassificationsPageContent(props: ClassificationsPageProps) {
  const { organizer, navigation, normalGrid, isOrganizing } =
    useOrganizeSession<AssetClassGridRow>({
      accountBookId: props.accountBookId ?? "storybook",
      requested: !!props.organize,
      available: !!props.organizerApi,
      page: "assetClasses",
      api: props.organizerApi,
      onSaved: () => {
        void props.onRefresh();
      },
    });
  const [dialog, setDialog] = useState<{
    draft: ClassDraft;
    deleting?: boolean;
  } | null>(null);
  const rows = useMemo(
    () => buildAssetClassGridRows(props.nodes),
    [props.nodes],
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
        ...rowActionsColumnProps,
        pinned: "right",
        cellRenderer: ({ data }: ICellRendererParams<AssetClassGridRow>) =>
          data ? (
            <AssetClassActionsCell
              row={data}
              onEdit={() => setDialog({ draft: data })}
              onAddChild={() =>
                setDialog({ draft: { name: "", parentId: data.id } })
              }
              onDelete={() => setDialog({ draft: data, deleting: true })}
            />
          ) : null,
      },
    ],
    [],
  );
  return (
    <Stack flex={1} mih={0}>
      <Group justify="space-between">
        <Box>
          {isOrganizing && (
            <Badge variant="light" size="lg">
              Organizing
            </Badge>
          )}
        </Box>
        {isOrganizing ? (
          <OrganizerActions organizer={organizer} onDone={navigation.exit} />
        ) : (
          <Group>
            {props.organizerApi && (
              <Button
                variant="default"
                leftSection={<IconArrowsMove size={16} />}
                disabled={organizer.loading}
                onClick={navigation.enter}
              >
                Organize
              </Button>
            )}
            <Button
              leftSection={<IconPlus size={16} />}
              onClick={() => setDialog({ draft: { name: "", parentId: null } })}
            >
              New Asset Class
            </Button>
          </Group>
        )}
      </Group>
      {isOrganizing && (
        <HierarchyOrganizer
          accountBookId={props.accountBookId ?? "storybook"}
          organizer={organizer}
          renderLifecycleDialog={(dialog, close) =>
            dialog?.action === "delete" &&
            dialog.node.nodeType === "assetClass" ? (
              <ClassDialog
                draft={dialog.node}
                deleting
                nodes={
                  organizer.snapshot?.nodes.filter(
                    (node) => node.nodeType === "assetClass",
                  ) ?? []
                }
                onClose={close}
                onRefresh={organizer.refresh}
                onSave={props.onSave}
                submitState={{
                  ...organizer.submitState,
                  isSubmitting: organizer.pending,
                }}
                onDelete={(id, replacementId) =>
                  organizer.performLifecycle(
                    "delete",
                    { id, nodeType: "assetClass" },
                    close,
                    replacementId,
                  )
                }
              />
            ) : null
          }
        />
      )}
      <Box
        style={{
          display: isOrganizing ? "none" : "flex",
          flexDirection: "column",
          flex: 1,
          minHeight: 0,
          gap: "var(--mantine-spacing-md)",
        }}
      >
        {organizer.loadError && (
          <Alert color="red" role="alert">
            {organizer.loadError}
            <Button variant="subtle" onClick={() => void organizer.load()}>
              Try Again
            </Button>
          </Alert>
        )}
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
          onGridReady={({ api }) => {
            normalGrid.current = api;
            api.setGridAriaProperty("label", "Asset Classes");
          }}
          localeText={GRID_LOCALE_TEXT}
        />
        <Text size="sm" c="dimmed">
          Accounts without an assignment appear as Unclassified.
        </Text>
      </Box>
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
