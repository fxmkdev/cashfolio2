import {
  createFileRoute,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { ActionIcon, Button, Container, Group, Modal, Tabs, Text, Title, Tooltip } from "@mantine/core";
import { IconPencil, IconPlus, IconTrash } from "@tabler/icons-react";
import { type ColDef, type ICellRendererParams } from "ag-grid-enterprise";
import { EditAccountModal } from "../components/edit-account-modal";
import type {
  AccountInitialValues,
  TransformedFormValues,
} from "../components/edit-account-modal";
import { EditAccountGroupModal } from "../components/edit-account-group-modal";
import type {
  AccountGroupInitialValues,
  AccountGroupTransformedFormValues,
} from "../components/edit-account-group-modal";
import { DataGrid } from "../components/data-grid";
import {
  createAccount,
  createAccountGroup,
  deleteAccount,
  deleteAccountGroup,
  getAccountGroups,
  getAccountTreeData,
  updateAccount,
  updateAccountGroup,
} from "../server/accounts";
import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../.prisma-client/enums";

const tabs = [
  { value: "ASSET", label: "Asset", type: AccountType.ASSET },
  { value: "LIABILITY", label: "Liability", type: AccountType.LIABILITY },
  {
    value: `EQUITY-${EquityAccountSubtype.INCOME}`,
    label: "Income",
    type: AccountType.EQUITY,
    equityAccountSubtype: EquityAccountSubtype.INCOME,
  },
  {
    value: `EQUITY-${EquityAccountSubtype.EXPENSE}`,
    label: "Expense",
    type: AccountType.EQUITY,
    equityAccountSubtype: EquityAccountSubtype.EXPENSE,
  },
  {
    value: `EQUITY-${EquityAccountSubtype.GAIN_LOSS}`,
    label: "Gain/Loss",
    type: AccountType.EQUITY,
    equityAccountSubtype: EquityAccountSubtype.GAIN_LOSS,
  },
] as const;

type TabValue = (typeof tabs)[number]["value"];

export const Route = createFileRoute("/$accountBookId")({
  validateSearch: (search: Record<string, unknown>): { tab: TabValue } => ({
    tab: tabs.some((t) => t.value === search.tab)
      ? (search.tab as TabValue)
      : "ASSET",
  }),
  loader: async ({ params: { accountBookId } }) => {
    const [accountGroups, ...treeDataByTab] = await Promise.all([
      getAccountGroups({ data: { accountBookId } }),
      ...tabs.map((t) =>
        getAccountTreeData({
          data: {
            accountBookId,
            type: t.type,
            ...("equityAccountSubtype" in t
              ? { equityAccountSubtype: t.equityAccountSubtype }
              : undefined),
          },
        }),
      ),
    ]);
    const treeData = Object.fromEntries(
      tabs.map((t, i) => [t.value, treeDataByTab[i]]),
    ) as Record<TabValue, Awaited<ReturnType<typeof getAccountTreeData>>>;
    const existingNodes = treeDataByTab.flat().map((n) => ({
      id: n.id,
      name: n.name,
      nodeType: n.nodeType,
      parentId: n.parentId,
      groupId: n.groupId,
    }));
    return { accountGroups, treeData, existingNodes };
  },
  component: AccountsPage,
});

type TreeRow = Awaited<ReturnType<typeof getAccountTreeData>>[number];

function AccountsPage() {
  const { accountGroups, treeData, existingNodes } = Route.useLoaderData();
  const { accountBookId } = Route.useParams();
  const { tab } = Route.useSearch();
  const navigate = useNavigate({ from: "/$accountBookId" });
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
  const [deletingRow, setDeletingRow] = useState<
    { id: string; nodeType: "account" | "accountGroup"; name: string } | undefined
  >();

  const isEquityTab = tab.startsWith("EQUITY-");

  const handleEditRow = useCallback(
    (data: TreeRow) => {
      if (data.nodeType === "account") {
        setEditingAccount({
          id: data.id,
          initialValues: {
            name: data.name,
            type: data.type,
            equityAccountSubtype: data.equityAccountSubtype,
            groupId: data.groupId,
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
          },
        });
        setEditGroupModalOpen(true);
      }
    },
    [],
  );

  const columnDefs = useMemo<ColDef<TreeRow>[]>(
    () => [
      ...(!isEquityTab
        ? [
            {
              colId: "currency",
              headerName: "Ccy.",
              filter: true,
              width: 100,
              valueGetter: ({ data }: { data: TreeRow | undefined }) => {
                if (!data?.unit) return undefined;
                switch (data.unit) {
                  case Unit.CURRENCY:
                    return data.currency;
                  case Unit.SECURITY:
                    return data.tradeCurrency;
                  case Unit.CRYPTOCURRENCY:
                    return data.cryptocurrency;
                }
              },
            } satisfies ColDef<TreeRow>,
            {
              field: "symbol",
              filter: true,
              width: 120,
            } satisfies ColDef<TreeRow>,
          ]
        : []),
      {
        colId: "actions",
        headerName: "",
        width: 80,
        sortable: false,
        filter: false,
        resizable: false,
        suppressHeaderMenuButton: true,
        cellClass: "actions-cell",
        cellRenderer: ({ data }: ICellRendererParams<TreeRow>) => {
          if (!data) return null;
          const deleteLabel = data.deleteDisabledReason ?? "Delete";
          return (
            <Group gap={4} wrap="nowrap" h="100%" align="center">
              <Tooltip label="Edit">
                <ActionIcon
                  variant="subtle"
                  size="sm"
                  onClick={() => handleEditRow(data)}
                  aria-label="Edit"
                >
                  <IconPencil size={16} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label={deleteLabel}>
                <ActionIcon
                  variant="subtle"
                  size="sm"
                  color="red"
                  disabled={!data.deletable}
                  onClick={() =>
                    setDeletingRow({
                      id: data.id,
                      nodeType: data.nodeType,
                      name: data.name,
                    })
                  }
                  aria-label="Delete"
                >
                  <IconTrash size={16} />
                </ActionIcon>
              </Tooltip>
            </Group>
          );
        },
      } satisfies ColDef<TreeRow>,
    ],
    [isEquityTab, handleEditRow],
  );

  async function handleCreateAccount(values: TransformedFormValues) {
    await createAccount({
      data: {
        accountBookId,
        name: values.name!,
        type: values.type,
        equityAccountSubtype: values.equityAccountSubtype,
        groupId: values.groupId!,
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
        groupId: values.groupId!,
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
      },
    });
    setEditGroupModalOpen(false);
    router.invalidate();
  }

  return (
    <Container size="lg" py="xl">
      <Group justify="space-between" mb="lg">
        <Title order={2}>Accounts</Title>
        <Group>
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
      </Group>

      <Tabs
        value={tab}
        onChange={(value) => navigate({ search: { tab: value as TabValue } })}
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
          filter: true,
          valueGetter: ({ data }) => data?.name,
          cellRendererParams: {
            suppressCount: true,
          },
        }}
        treeData={true}
        treeDataParentIdField="parentId"
        getRowId={({ data }) => data.id}
      />

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

      <Modal
        opened={!!deletingRow}
        onClose={() => setDeletingRow(undefined)}
        title={
          deletingRow?.nodeType === "account"
            ? "Delete Account"
            : "Delete Group"
        }
      >
        <Text mb="lg">
          Are you sure you want to delete {deletingRow?.name}?
        </Text>
        <Group justify="flex-end">
          <Button variant="subtle" onClick={() => setDeletingRow(undefined)}>
            Cancel
          </Button>
          <Button color="red" onClick={handleDelete}>
            Delete
          </Button>
        </Group>
      </Modal>
    </Container>
  );
}
