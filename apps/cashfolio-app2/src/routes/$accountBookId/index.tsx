import {
  createFileRoute,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { useCallback, useState } from "react";
import {
  Breadcrumbs,
  Button,
  Container,
  Tabs,
  Title,
  Group,
} from "@mantine/core";
import { IconArchive, IconPlus } from "@tabler/icons-react";
import { useExpandedGroups } from "../../hooks/use-expanded-groups";
import { ConfirmArchiveModal } from "../../components/confirm-archive-modal";
import { ConfirmDeleteModal } from "../../components/confirm-delete-modal";
import { EditAccountModal } from "../../components/edit-account-modal";
import type {
  AccountInitialValues,
  TransformedFormValues,
} from "../../components/edit-account-modal";
import { EditAccountGroupModal } from "../../components/edit-account-group-modal";
import type {
  AccountGroupInitialValues,
  AccountGroupTransformedFormValues,
} from "../../components/edit-account-group-modal";
import { ReorderGroupChildrenModal } from "../../components/reorder-group-children-modal";
import { DataGrid } from "../../components/data-grid";
import {
  archiveAccount,
  archiveAccountGroup,
  createAccount,
  createAccountGroup,
  deleteAccount,
  deleteAccountGroup,
  reorderAccountTreeItems,
  unarchiveAccount,
  unarchiveAccountGroup,
  updateAccount,
  updateAccountGroup,
} from "../../server/accounts";
import { getAccountsBreadcrumbSegments } from "../../components/accounts-breadcrumb-segments";
import {
  getEntityLabel,
  parseAccountsSearch,
  tabs,
  type TabValue,
  type TreeRow,
} from "./accounts-page-types";
import { loadAccountsPageData } from "./accounts-page-loader";
import {
  useBalanceInReferenceCurrencyByGroupId,
  useRowsByParentKey,
  useSelectedSiblingRows,
} from "./accounts-page-data";
import { useAccountTreeColumnDefs } from "./accounts-page-columns";

export const Route = createFileRoute("/$accountBookId/")({
  validateSearch: parseAccountsSearch,
  loaderDeps: ({ search }) => ({ mode: search.mode }),
  loader: async ({ params: { accountBookId }, deps: { mode } }) => {
    return loadAccountsPageData({ accountBookId, mode });
  },
  component: AccountsPage,
});

function AccountsPage() {
  const { accountGroups, treeData, existingNodes, referenceCurrency } =
    Route.useLoaderData();
  const { accountBookId } = Route.useParams();
  const { tab, mode } = Route.useSearch();
  const navigate = useNavigate({ from: "/$accountBookId/" });
  const router = useRouter();
  const [createModalOpened, setCreateModalOpened] = useState(false);
  const [editingAccount, setEditingAccount] = useState<
    { id: string; initialValues: AccountInitialValues } | undefined
  >();
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [createGroupModalOpened, setCreateGroupModalOpened] = useState(false);
  const [editingGroup, setEditingGroup] = useState<
    { id: string; initialValues: AccountGroupInitialValues } | undefined
  >();
  const [editGroupModalOpen, setEditGroupModalOpen] = useState(false);
  const [archivingRow, setArchivingRow] = useState<
    | { id: string; nodeType: "account" | "accountGroup"; name: string }
    | undefined
  >();
  const [deletingRow, setDeletingRow] = useState<
    | { id: string; nodeType: "account" | "accountGroup"; name: string }
    | undefined
  >();
  const [reorderingRow, setReorderingRow] = useState<
    { name: string; parentKey: string } | undefined
  >();

  const isEquityTab = tab.startsWith("EQUITY-");
  const isArchivedMode = mode === "archived";

  const storageKey = `cashfolio:expandedGroups:${accountBookId}:${mode}:${tab}`;
  const { isGroupOpenByDefault, onRowGroupOpened } =
    useExpandedGroups(storageKey);

  const rowsByParentKey = useRowsByParentKey(treeData[tab]);
  const selectedSiblingRows = useSelectedSiblingRows(
    rowsByParentKey,
    reorderingRow,
  );
  const balanceInReferenceCurrencyByGroupId =
    useBalanceInReferenceCurrencyByGroupId(rowsByParentKey, treeData[tab]);

  const handleEditRow = useCallback((data: TreeRow) => {
    if (data.nodeType === "account") {
      setEditingAccount({
        id: data.id,
        initialValues: {
          name: data.name,
          type: data.type,
          equityAccountSubtype: data.equityAccountSubtype,
          groupId: data.groupId ?? undefined,
          sortOrder: data.sortOrder ?? undefined,
          unit: data.unit,
          currency: data.currency,
          cryptocurrency: data.cryptocurrency,
          symbol: data.symbol,
          tradeCurrency: data.tradeCurrency,
        },
      });
      setEditModalOpen(true);
    } else if (data.nodeType === "accountGroup") {
      setEditingGroup({
        id: data.id,
        initialValues: {
          name: data.name,
          type: data.type,
          equityAccountSubtype: data.equityAccountSubtype,
          parentGroupId: data.parentId,
          sortOrder: data.sortOrder ?? undefined,
        },
      });
      setEditGroupModalOpen(true);
    }
  }, []);

  const handleUnarchiveRow = useCallback(
    async (row: TreeRow) => {
      if (row.nodeType === "account") {
        await unarchiveAccount({ data: { id: row.id, accountBookId } });
      } else {
        await unarchiveAccountGroup({ data: { id: row.id, accountBookId } });
      }
      router.invalidate();
    },
    [accountBookId, router],
  );

  const columnDefs = useAccountTreeColumnDefs({
    isArchivedMode,
    isEquityTab,
    rowsByParentKey,
    referenceCurrency,
    balanceInReferenceCurrencyByGroupId,
    onEditRow: handleEditRow,
    onUnarchiveRow: handleUnarchiveRow,
    onArchiveRow: setArchivingRow,
    onDeleteRow: setDeletingRow,
    onReorderRow: setReorderingRow,
  });

  async function handleCreateAccount(values: TransformedFormValues) {
    await createAccount({
      data: {
        accountBookId,
        name: values.name!,
        type: values.type,
        equityAccountSubtype: values.equityAccountSubtype,
        groupId: values.groupId,
        sortOrder: values.sortOrder,
        unit: values.unit,
        currency: values.currency,
        cryptocurrency: values.cryptocurrency,
        symbol: values.symbol,
        tradeCurrency: values.tradeCurrency,
      },
    });
    setCreateModalOpened(false);
    router.invalidate();
  }

  async function handleUpdateAccount(values: TransformedFormValues) {
    if (!editingAccount) return;
    await updateAccount({
      data: {
        id: editingAccount.id,
        accountBookId,
        name: values.name!,
        type: values.type,
        equityAccountSubtype: values.equityAccountSubtype,
        groupId: values.groupId,
        sortOrder: values.sortOrder,
        unit: values.unit,
        currency: values.currency,
        cryptocurrency: values.cryptocurrency,
        symbol: values.symbol,
        tradeCurrency: values.tradeCurrency,
      },
    });
    setEditModalOpen(false);
    router.invalidate();
  }

  async function handleCreateGroup(values: AccountGroupTransformedFormValues) {
    await createAccountGroup({
      data: {
        accountBookId,
        name: values.name!,
        type: values.type,
        equityAccountSubtype: values.equityAccountSubtype,
        parentGroupId: values.parentGroupId,
        sortOrder: values.sortOrder,
      },
    });
    setCreateGroupModalOpened(false);
    router.invalidate();
  }

  async function handleDelete() {
    if (!deletingRow) return;
    if (deletingRow.nodeType === "account") {
      await deleteAccount({ data: { id: deletingRow.id, accountBookId } });
    } else {
      await deleteAccountGroup({ data: { id: deletingRow.id, accountBookId } });
    }
    setDeletingRow(undefined);
    router.invalidate();
  }

  async function handleArchive() {
    if (!archivingRow) return;
    if (archivingRow.nodeType === "account") {
      await archiveAccount({ data: { id: archivingRow.id, accountBookId } });
    } else {
      await archiveAccountGroup({
        data: { id: archivingRow.id, accountBookId },
      });
    }
    setArchivingRow(undefined);
    router.invalidate();
  }

  async function handleUpdateGroup(values: AccountGroupTransformedFormValues) {
    if (!editingGroup) return;
    await updateAccountGroup({
      data: {
        id: editingGroup.id,
        accountBookId,
        name: values.name!,
        type: values.type,
        equityAccountSubtype: values.equityAccountSubtype,
        parentGroupId: values.parentGroupId,
        sortOrder: values.sortOrder,
      },
    });
    setEditGroupModalOpen(false);
    router.invalidate();
  }

  async function handleReorderSiblings(
    rows: { id: string; nodeType: "account" | "accountGroup" }[],
  ) {
    await reorderAccountTreeItems({
      data: {
        accountBookId,
        updates: rows.map((row, i) => ({
          id: row.id,
          nodeType: row.nodeType,
          sortOrder: i,
        })),
      },
    });
    router.invalidate();
  }

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
        {!isArchivedMode && (
          <Group>
            <Button
              variant="default"
              leftSection={<IconArchive size={16} />}
              onClick={() =>
                navigate({
                  search: {
                    tab,
                    mode: "archived",
                  },
                })
              }
            >
              Archive
            </Button>
            <Button
              variant="default"
              leftSection={<IconPlus size={16} />}
              onClick={() => setCreateGroupModalOpened(true)}
            >
              Add Group
            </Button>
            <Button
              leftSection={<IconPlus size={16} />}
              onClick={() => setCreateModalOpened(true)}
            >
              Add Account
            </Button>
          </Group>
        )}
      </Group>

      <Tabs
        value={tab}
        onChange={(value) =>
          navigate({ search: { tab: value as TabValue, mode } })
        }
      >
        <Tabs.List mb="md">
          {tabs.map((t) => (
            <Tabs.Tab key={t.value} value={t.value}>
              {t.label}
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs>

      <DataGrid
        containerStyle={{ height: "calc(100vh - 11rem)" }}
        rowData={treeData[tab]}
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
        isGroupOpenByDefault={isGroupOpenByDefault}
        onRowGroupOpened={onRowGroupOpened}
        getRowId={({ data }) => data.id}
        onRowDoubleClicked={(e) => {
          if (e.data?.nodeType === "account") {
            navigate({
              to: "/$accountBookId/$accountId",
              params: { accountBookId, accountId: e.data.id },
            });
          }
        }}
      />

      {!isArchivedMode && (
        <>
          <EditAccountModal
            opened={createModalOpened}
            onClose={() => setCreateModalOpened(false)}
            accountGroups={accountGroups}
            onSubmit={handleCreateAccount}
            existingNodes={existingNodes}
            typeDescriptor={tab}
          />

          <EditAccountModal
            opened={editModalOpen}
            onClose={() => setEditModalOpen(false)}
            onExitTransitionEnd={() => setEditingAccount(undefined)}
            accountGroups={accountGroups}
            onSubmit={handleUpdateAccount}
            initialValues={editingAccount?.initialValues}
            existingNodes={existingNodes}
            editingId={editingAccount?.id}
            typeDescriptor={tab}
          />

          <EditAccountGroupModal
            opened={createGroupModalOpened}
            onClose={() => setCreateGroupModalOpened(false)}
            accountGroups={accountGroups}
            onSubmit={handleCreateGroup}
            existingNodes={existingNodes}
            typeDescriptor={tab}
          />

          <EditAccountGroupModal
            opened={editGroupModalOpen}
            onClose={() => setEditGroupModalOpen(false)}
            onExitTransitionEnd={() => setEditingGroup(undefined)}
            accountGroups={accountGroups}
            onSubmit={handleUpdateGroup}
            initialValues={editingGroup?.initialValues}
            existingNodes={existingNodes}
            editingId={editingGroup?.id}
            typeDescriptor={tab}
          />

          <ConfirmDeleteModal
            opened={!!deletingRow}
            onClose={() => setDeletingRow(undefined)}
            title={
              deletingRow
                ? `Delete ${getEntityLabel(deletingRow.nodeType)}`
                : "Delete"
            }
            name={deletingRow?.name}
            onConfirm={handleDelete}
          />

          <ConfirmArchiveModal
            opened={!!archivingRow}
            onClose={() => setArchivingRow(undefined)}
            title={
              archivingRow
                ? `Archive ${getEntityLabel(archivingRow.nodeType)}`
                : "Archive"
            }
            name={archivingRow?.name}
            onConfirm={handleArchive}
          />

          <ReorderGroupChildrenModal
            opened={!!reorderingRow}
            onClose={() => setReorderingRow(undefined)}
            rowName={reorderingRow?.name ?? ""}
            initialRows={selectedSiblingRows}
            onReorder={handleReorderSiblings}
          />
        </>
      )}
    </Container>
  );
}
