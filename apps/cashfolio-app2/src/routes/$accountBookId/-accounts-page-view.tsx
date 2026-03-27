import {
  Breadcrumbs,
  Button,
  Container,
  Group,
  Tabs,
  Title,
} from "@mantine/core";
import {
  IconArchive,
  IconLayoutDashboard,
  IconPlus,
} from "@tabler/icons-react";
import type { AgGridReactProps } from "ag-grid-react";
import { LinkButton } from "../../components/link-button";
import { LinkTab } from "../../components/link-tab";
import type { AccountGroupInitialValues } from "../../components/edit-account-group-modal";
import {
  EditAccountGroupModal,
  type AccountGroupTransformedFormValues,
} from "../../components/edit-account-group-modal";
import type { AccountInitialValues } from "../../components/edit-account-modal";
import {
  EditAccountModal,
  type TransformedFormValues,
} from "../../components/edit-account-modal";
import { ConfirmArchiveModal } from "../../components/confirm-archive-modal";
import { ConfirmDeleteModal } from "../../components/confirm-delete-modal";
import { DataGrid } from "../../components/data-grid";
import { getAccountsBreadcrumbSegments } from "../../components/accounts-breadcrumb-segments";
import {
  ReorderGroupChildrenModal,
  type ReorderGroupChildRow,
} from "../../components/reorder-group-children-modal";
import { getEntityLabel } from "./-accounts-page-types";
import type {
  AccountsGridRow,
  AccountsMode,
  ReferenceCurrencyTotalFooterRow,
  TabValue,
  TreeRow,
} from "./-accounts-page-types";
import type { loadAccountsPageData } from "./-accounts-page-loader";

type AccountsPageLoaderData = Awaited<ReturnType<typeof loadAccountsPageData>>;
type RowTarget = {
  id: string;
  nodeType: "account" | "accountGroup";
  name: string;
};

export type AccountsPageViewProps = {
  accountBookId: string;
  tab: TabValue;
  mode: AccountsMode;
  tabs: readonly { value: TabValue; label: string }[];
  accountGroups: AccountsPageLoaderData["accountGroups"];
  existingNodes: AccountsPageLoaderData["existingNodes"];
  rows: TreeRow[];
  columnDefs: NonNullable<AgGridReactProps<AccountsGridRow>["columnDefs"]>;
  onGridReady?: AgGridReactProps<AccountsGridRow>["onGridReady"];
  pinnedBottomRowData?: ReferenceCurrencyTotalFooterRow[];
  isGroupOpenByDefault: AgGridReactProps<AccountsGridRow>["isGroupOpenByDefault"];
  onRowGroupOpened: AgGridReactProps<AccountsGridRow>["onRowGroupOpened"];
  createModalOpened: boolean;
  editModalOpen: boolean;
  createGroupModalOpened: boolean;
  editGroupModalOpen: boolean;
  editingAccount?: { id: string; initialValues: AccountInitialValues };
  editingGroup?: { id: string; initialValues: AccountGroupInitialValues };
  deletingRow?: RowTarget;
  archivingRow?: RowTarget;
  reorderingRow?: { name: string; parentKey: string };
  selectedSiblingRows: ReorderGroupChildRow[];
  onOpenCreateGroup: () => void;
  onOpenCreateAccount: () => void;
  onOpenLedger: (accountId: string) => void;
  onCloseCreateAccount: () => void;
  onSubmitCreateAccount: (values: TransformedFormValues) => Promise<void>;
  onCloseEditAccount: () => void;
  onClearEditingAccount: () => void;
  onSubmitUpdateAccount: (values: TransformedFormValues) => Promise<void>;
  onCloseCreateGroup: () => void;
  onSubmitCreateGroup: (
    values: AccountGroupTransformedFormValues,
  ) => Promise<void>;
  onCloseEditGroup: () => void;
  onClearEditingGroup: () => void;
  onSubmitUpdateGroup: (
    values: AccountGroupTransformedFormValues,
  ) => Promise<void>;
  onCloseDelete: () => void;
  onConfirmDelete: () => Promise<void>;
  onCloseArchive: () => void;
  onConfirmArchive: () => Promise<void>;
  onCloseReorder: () => void;
  onReorderSiblings: (
    rows: { id: string; nodeType: "account" | "accountGroup" }[],
  ) => Promise<void>;
};

export function AccountsPageView({
  accountBookId,
  tab,
  mode,
  tabs,
  accountGroups,
  existingNodes,
  rows,
  columnDefs,
  onGridReady,
  pinnedBottomRowData,
  isGroupOpenByDefault,
  onRowGroupOpened,
  createModalOpened,
  editModalOpen,
  createGroupModalOpened,
  editGroupModalOpen,
  editingAccount,
  editingGroup,
  deletingRow,
  archivingRow,
  reorderingRow,
  selectedSiblingRows,
  onOpenCreateGroup,
  onOpenCreateAccount,
  onOpenLedger,
  onCloseCreateAccount,
  onSubmitCreateAccount,
  onCloseEditAccount,
  onClearEditingAccount,
  onSubmitUpdateAccount,
  onCloseCreateGroup,
  onSubmitCreateGroup,
  onCloseEditGroup,
  onClearEditingGroup,
  onSubmitUpdateGroup,
  onCloseDelete,
  onConfirmDelete,
  onCloseArchive,
  onConfirmArchive,
  onCloseReorder,
  onReorderSiblings,
}: AccountsPageViewProps) {
  const isArchivedMode = mode === "archived";

  return (
    <Container fluid py="xl" px="xl">
      <Group mb="lg" gap="md" justify="space-between" mih={36}>
        {isArchivedMode ? (
          <Breadcrumbs fz="h2" fw={700} lh="var(--mantine-h2-line-height)">
            {getAccountsBreadcrumbSegments({
              accountBookId,
              tab,
              mode: "archived",
              archiveIsLink: false,
            })}
          </Breadcrumbs>
        ) : (
          <Title order={2}>Accounts</Title>
        )}
        <Group>
          <LinkButton
            variant="default"
            leftSection={<IconLayoutDashboard size={16} />}
            to="/$accountBookId"
            params={{ accountBookId }}
          >
            Dashboard
          </LinkButton>
          {!isArchivedMode && (
            <>
              <LinkButton
                variant="default"
                leftSection={<IconArchive size={16} />}
                to="/$accountBookId/accounts"
                params={{ accountBookId }}
                search={{ tab, mode: "archived" }}
              >
                Archive
              </LinkButton>
              <Button
                variant="default"
                leftSection={<IconPlus size={16} />}
                onClick={onOpenCreateGroup}
              >
                Add Group
              </Button>
              <Button
                leftSection={<IconPlus size={16} />}
                onClick={onOpenCreateAccount}
              >
                Add Account
              </Button>
            </>
          )}
        </Group>
      </Group>

      <Tabs value={tab}>
        <Tabs.List mb="md">
          {tabs.map((t) => (
            <LinkTab
              key={t.value}
              value={t.value}
              to="/$accountBookId/accounts"
              params={{ accountBookId }}
              search={{ tab: t.value, mode }}
            >
              {t.label}
            </LinkTab>
          ))}
        </Tabs.List>
      </Tabs>

      <DataGrid
        containerStyle={{ height: "calc(100vh - 11rem)" }}
        // Work around an AG Grid React + React 19 crash path observed in CI.
        // See AG Grid React GridOptions docs for `renderingMode`:
        // https://www.ag-grid.com/react-data-grid/grid-options/
        renderingMode="legacy"
        // Keep framework components non-reactive for this grid to avoid React 19
        // teardown crashes in AG Grid's group cell renderer path.
        // See AG Grid React GridOptions docs for `reactiveCustomComponents`.
        reactiveCustomComponents={false}
        rowSelection={{
          mode: "singleRow",
          checkboxes: false,
          enableClickSelection: false,
        }}
        rowData={rows}
        columnDefs={columnDefs}
        autoGroupColumnDef={{
          headerName: "Name",
          field: "name",
          flex: 1,
          filter: "agTextColumnFilter",
          valueGetter: ({ data }) => data?.name,
          cellRendererParams: {
            suppressCount: true,
          },
        }}
        treeData={true}
        treeDataParentIdField="parentId"
        pinnedBottomRowData={pinnedBottomRowData}
        onGridReady={onGridReady}
        isGroupOpenByDefault={isGroupOpenByDefault}
        onRowGroupOpened={onRowGroupOpened}
        getRowId={({ data }) => data.id}
        onRowDoubleClicked={(e) => {
          if (e.data?.nodeType === "account") {
            onOpenLedger(e.data.id);
          }
        }}
      />

      {!isArchivedMode && (
        <>
          <EditAccountModal
            opened={createModalOpened}
            onClose={onCloseCreateAccount}
            accountGroups={accountGroups}
            onSubmit={onSubmitCreateAccount}
            existingNodes={existingNodes}
            typeDescriptor={tab}
          />

          <EditAccountModal
            opened={editModalOpen}
            onClose={onCloseEditAccount}
            onExitTransitionEnd={onClearEditingAccount}
            accountGroups={accountGroups}
            onSubmit={onSubmitUpdateAccount}
            initialValues={editingAccount?.initialValues}
            existingNodes={existingNodes}
            editingId={editingAccount?.id}
            typeDescriptor={tab}
          />

          <EditAccountGroupModal
            opened={createGroupModalOpened}
            onClose={onCloseCreateGroup}
            accountGroups={accountGroups}
            onSubmit={onSubmitCreateGroup}
            existingNodes={existingNodes}
            typeDescriptor={tab}
          />

          <EditAccountGroupModal
            opened={editGroupModalOpen}
            onClose={onCloseEditGroup}
            onExitTransitionEnd={onClearEditingGroup}
            accountGroups={accountGroups}
            onSubmit={onSubmitUpdateGroup}
            initialValues={editingGroup?.initialValues}
            existingNodes={existingNodes}
            editingId={editingGroup?.id}
            typeDescriptor={tab}
          />

          <ConfirmDeleteModal
            opened={!!deletingRow}
            onClose={onCloseDelete}
            title={
              deletingRow
                ? `Delete ${getEntityLabel(deletingRow.nodeType)}`
                : "Delete"
            }
            name={deletingRow?.name}
            onConfirm={onConfirmDelete}
          />

          <ConfirmArchiveModal
            opened={!!archivingRow}
            onClose={onCloseArchive}
            title={
              archivingRow
                ? `Archive ${getEntityLabel(archivingRow.nodeType)}`
                : "Archive"
            }
            name={archivingRow?.name}
            onConfirm={onConfirmArchive}
          />

          <ReorderGroupChildrenModal
            opened={!!reorderingRow}
            onClose={onCloseReorder}
            rowName={reorderingRow?.name ?? ""}
            initialRows={selectedSiblingRows}
            onReorder={onReorderSiblings}
          />
        </>
      )}
    </Container>
  );
}
