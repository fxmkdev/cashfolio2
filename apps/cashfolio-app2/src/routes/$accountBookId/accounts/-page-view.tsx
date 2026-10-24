import type { AccountGainLossSummaries } from "@/shared/account-gain-loss";
import { Alert, Button, Group, Tabs, Text, Title } from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import type { AgGridReactProps } from "ag-grid-react";
import { LinkTab } from "@/components/navigation/link-tab";
import { TopPageHeader } from "@/components/layout/top-page-header";
import type { AccountGroupInitialValues } from "@/components/account-editor/edit-account-group-modal";
import {
  EditAccountGroupModal,
  type AccountGroupTransformedFormValues,
} from "@/components/account-editor/edit-account-group-modal";
import type { AccountInitialValues } from "@/components/account-editor/edit-account-modal";
import {
  EditAccountModal,
  type TransformedFormValues,
} from "@/components/account-editor/edit-account-modal";
import { ConfirmArchiveModal } from "@/components/dialogs/confirm-archive-modal";
import { ConfirmDeleteModal } from "@/components/dialogs/confirm-delete-modal";
import { DataGrid } from "@/components/grid/data-grid";
import { PageShell } from "@/components/layout/page-shell";
import { UnarchiveMutationFeedback } from "@/components/dialogs/unarchive-mutation-feedback";
import type { useUnarchiveMutation } from "@/hooks/use-unarchive-mutation";
import {
  ReorderGroupChildrenModal,
  type ReorderGroupChildRow,
} from "@/components/account-tree/reorder-group-children-modal";
import { getAccountsPageTitle, getEntityLabel } from "./-page-types";
import type {
  AccountsGridRow,
  AccountsMode,
  ReferenceCurrencyTotalFooterRow,
  TabValue,
  TreeRow,
} from "./-page-types";
import type { loadAccountsPageData } from "./-page-loader";
import { postSortAccountRows } from "./-archived-grid-rows";
import {
  AccountNameCell,
  suppressAccountNameKeyboardEvent,
} from "./-account-name-cell";
import { AccountGainLossDetails } from "./-gain-loss-header";

type AccountsPageLoaderData = Awaited<ReturnType<typeof loadAccountsPageData>>;
type RowTarget = {
  id: string;
  nodeType: "account" | "accountGroup";
  name: string;
};

export type AccountsPageViewProps = {
  gainLoss?: {
    data?: AccountGainLossSummaries;
    error?: string;
    loading: boolean;
    retry: () => void;
  };
  accountBookId: string;
  onRefreshConstraints?: () => Promise<void>;
  unarchiveRecovery?: ReturnType<typeof useUnarchiveMutation>;
  tab: TabValue;
  mode: AccountsMode;
  tabs: readonly { value: TabValue; label: string }[];
  archivedAccountGroups?: AccountsPageLoaderData["archivedAccountGroups"];
  archivedExistingNodes?: AccountsPageLoaderData["archivedExistingNodes"];
  accountGroups: AccountsPageLoaderData["accountGroups"];
  existingNodes: AccountsPageLoaderData["existingNodes"];
  unitUsage: AccountsPageLoaderData["unitUsage"];
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
  gainLoss,
  accountBookId,
  onRefreshConstraints,
  unarchiveRecovery,
  tab,
  tabs,
  accountGroups,
  existingNodes,
  archivedAccountGroups = accountGroups,
  archivedExistingNodes = existingNodes,
  unitUsage,
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
  const isEditingArchivedAccount = rows.some(
    (row) => row.id === editingAccount?.id && !row.isActive,
  );
  const isEditingArchivedGroup = rows.some(
    (row) => row.id === editingGroup?.id && !row.isActive,
  );

  return (
    <PageShell>
      <TopPageHeader
        heading={<Title order={2}>{getAccountsPageTitle()}</Title>}
        actions={
          <Group>
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
          </Group>
        }
      />

      <UnarchiveMutationFeedback
        recovery={unarchiveRecovery}
        onRefreshConstraints={onRefreshConstraints}
      />
      <Tabs value={tab}>
        <Tabs.List mb="md">
          {tabs.map((t) => (
            <LinkTab
              key={t.value}
              value={t.value}
              to="/$accountBookId/accounts"
              params={{ accountBookId }}
              search={{ tab: t.value, mode: "active" }}
            >
              {t.label}
            </LinkTab>
          ))}
        </Tabs.List>
      </Tabs>

      <Text size="sm" c="dimmed" mb="sm">
        Totals include active and archived accounts, including collapsed groups.
      </Text>
      {gainLoss?.error ? (
        <Alert color="red" title="Gain/Loss Unavailable" mb="sm">
          {gainLoss.error}
          <Button variant="subtle" size="xs" onClick={gainLoss.retry}>
            Retry
          </Button>
        </Alert>
      ) : null}
      <AccountGainLossDetails
        data={gainLoss?.data}
        loading={gainLoss?.loading ?? false}
      >
        <DataGrid
          containerStyle={{ flex: 1, minHeight: 0 }}
          rowData={rows}
          columnDefs={columnDefs}
          autoGroupColumnDef={{
            headerName: "Name",
            field: "name",
            flex: 1,
            minWidth: 320,
            filter: "agTextColumnFilter",
            valueGetter: ({ data }) => data?.name,
            suppressKeyboardEvent: suppressAccountNameKeyboardEvent,
            cellRendererParams: {
              suppressCount: true,
              innerRenderer: AccountNameCell,
            },
          }}
          postSortRows={postSortAccountRows}
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
      </AccountGainLossDetails>

      <>
        <EditAccountModal
          onRefreshConstraints={onRefreshConstraints}
          opened={createModalOpened}
          onClose={onCloseCreateAccount}
          accountGroups={accountGroups}
          unitUsage={unitUsage}
          onSubmit={onSubmitCreateAccount}
          existingNodes={existingNodes}
          typeDescriptor={tab}
        />
        <ConfirmArchiveModal
          onRefreshConstraints={onRefreshConstraints}
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
      </>

      <EditAccountGroupModal
        onRefreshConstraints={onRefreshConstraints}
        opened={createGroupModalOpened}
        onClose={onCloseCreateGroup}
        accountGroups={accountGroups}
        onSubmit={onSubmitCreateGroup}
        existingNodes={existingNodes}
        typeDescriptor={tab}
      />

      <EditAccountModal
        onRefreshConstraints={onRefreshConstraints}
        opened={editModalOpen}
        onClose={onCloseEditAccount}
        onExitTransitionEnd={onClearEditingAccount}
        accountGroups={
          isEditingArchivedAccount ? archivedAccountGroups : accountGroups
        }
        unitUsage={unitUsage}
        onSubmit={onSubmitUpdateAccount}
        initialValues={editingAccount?.initialValues}
        existingNodes={
          isEditingArchivedAccount ? archivedExistingNodes : existingNodes
        }
        editingId={editingAccount?.id}
        typeDescriptor={tab}
      />

      <EditAccountGroupModal
        onRefreshConstraints={onRefreshConstraints}
        opened={editGroupModalOpen}
        onClose={onCloseEditGroup}
        onExitTransitionEnd={onClearEditingGroup}
        accountGroups={
          isEditingArchivedGroup ? archivedAccountGroups : accountGroups
        }
        onSubmit={onSubmitUpdateGroup}
        initialValues={editingGroup?.initialValues}
        existingNodes={
          isEditingArchivedGroup ? archivedExistingNodes : existingNodes
        }
        editingId={editingGroup?.id}
        typeDescriptor={tab}
      />

      <ConfirmDeleteModal
        onRefreshConstraints={onRefreshConstraints}
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

      <ReorderGroupChildrenModal
        key={reorderingRow?.parentKey}
        onRefreshConstraints={onRefreshConstraints}
        opened={!!reorderingRow}
        onClose={onCloseReorder}
        rowName={reorderingRow?.name ?? ""}
        initialRows={selectedSiblingRows}
        onReorder={onReorderSiblings}
      />
    </PageShell>
  );
}
