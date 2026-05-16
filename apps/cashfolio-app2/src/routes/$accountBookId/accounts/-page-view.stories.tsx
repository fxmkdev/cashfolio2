import type { Meta, StoryObj } from "@storybook/react-vite";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Box, Text } from "@mantine/core";
import { useMemo, useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import { AccountType, Unit } from "@/.prisma-client/enums";
import type { AccountGroupInitialValues } from "@/components/edit-account-group-modal";
import type {
  AccountInitialValues,
  TransformedFormValues,
} from "@/components/edit-account-modal";
import type { ReorderGroupChildRow } from "@/components/reorder-group-children-modal";
import { useAccountTreeColumnDefs } from "./-page-columns";
import {
  useBalanceInReferenceCurrencyByGroupId,
  useReferenceCurrencyBalanceTotal,
  useRowsByParentKey,
  useSelectedSiblingRows,
} from "./-page-data";
import { AccountsPageView, type AccountsPageViewProps } from "./-page-view";
import {
  REFERENCE_CURRENCY_TOTAL_FOOTER_ROW_ID,
  type AccountsMode,
  tabs,
  type TabValue,
  type TreeRow,
} from "./-page-types";

function createGroupRow(args: {
  id: string;
  name: string;
  parentId?: string;
  isActive: boolean;
  type: AccountType;
  sortOrder: number;
}): TreeRow {
  return {
    id: args.id,
    nodeType: "accountGroup",
    name: args.name,
    type: args.type,
    equityAccountSubtype: null,
    unit: null,
    currency: null,
    cryptocurrency: null,
    symbol: null,
    tradeCurrency: null,
    balance: null,
    balanceInReferenceCurrency: null,
    openingBalance: null,
    hasBookings: false,
    parentId: args.parentId,
    isActive: args.isActive,
    groupId: args.id,
    sortOrder: args.sortOrder,
    deletable: false,
    deleteDisabledReason: "Cannot delete group because it contains accounts",
    archivable: false,
    archiveDisabledReason:
      "Cannot archive group because it contains active sub-groups",
    unarchivable: !args.isActive,
    unarchiveDisabledReason: args.isActive
      ? "Group is already active"
      : undefined,
  };
}

function createAccountRow(args: {
  id: string;
  name: string;
  groupId?: string;
  isActive: boolean;
  type: AccountType;
  sortOrder: number;
  currency: string;
  balance: number;
  balanceInReferenceCurrency: number;
}): TreeRow {
  return {
    id: args.id,
    nodeType: "account",
    name: args.name,
    type: args.type,
    equityAccountSubtype: null,
    unit: Unit.CURRENCY,
    currency: args.currency,
    cryptocurrency: null,
    symbol: null,
    tradeCurrency: null,
    balance: args.balance,
    balanceInReferenceCurrency: args.balanceInReferenceCurrency,
    openingBalance: null,
    hasBookings: true,
    parentId: args.groupId,
    isActive: args.isActive,
    groupId: args.groupId,
    sortOrder: args.sortOrder,
    deletable: true,
    deleteDisabledReason: undefined,
    archivable: args.isActive,
    archiveDisabledReason: args.isActive
      ? undefined
      : "Account is already archived",
    unarchivable: !args.isActive,
    unarchiveDisabledReason: args.isActive
      ? "Account is already active"
      : undefined,
  };
}

const activeAssetRows: TreeRow[] = [
  createGroupRow({
    id: "group-assets",
    name: "Assets",
    type: AccountType.ASSET,
    isActive: true,
    sortOrder: 0,
  }),
  createGroupRow({
    id: "group-cash",
    name: "Cash",
    parentId: "group-assets",
    type: AccountType.ASSET,
    isActive: true,
    sortOrder: 0,
  }),
  createAccountRow({
    id: "account-checking",
    name: "Checking",
    groupId: "group-cash",
    type: AccountType.ASSET,
    isActive: true,
    sortOrder: 0,
    currency: "CHF",
    balance: 1250.55,
    balanceInReferenceCurrency: 1250.55,
  }),
  createAccountRow({
    id: "account-wallet",
    name: "Wallet",
    groupId: "group-assets",
    type: AccountType.ASSET,
    isActive: true,
    sortOrder: 1,
    currency: "CHF",
    balance: 120,
    balanceInReferenceCurrency: 120,
  }),
];

const archivedAssetRows: TreeRow[] = activeAssetRows.map((row) => ({
  ...row,
  isActive: false,
  archivable: false,
  archiveDisabledReason:
    row.nodeType === "accountGroup"
      ? "Group is already archived"
      : "Account is already archived",
  unarchivable: true,
  unarchiveDisabledReason: undefined,
}));

const accountGroups: AccountsPageViewProps["accountGroups"] = [
  {
    value: "group-assets",
    label: "Assets",
    type: AccountType.ASSET,
    equityAccountSubtype: null,
    parentGroupId: null,
    treePath: [],
    treeLabel: "Assets",
  },
  {
    value: "group-cash",
    label: "Assets / Cash",
    type: AccountType.ASSET,
    equityAccountSubtype: null,
    parentGroupId: "group-assets",
    treePath: ["Assets"],
    treeLabel: "Cash",
  },
];

const existingNodes: AccountsPageViewProps["existingNodes"] = [
  {
    id: "group-assets",
    name: "Assets",
    nodeType: "accountGroup",
    parentId: undefined,
    groupId: undefined,
  },
  {
    id: "group-cash",
    name: "Cash",
    nodeType: "accountGroup",
    parentId: "group-assets",
    groupId: undefined,
  },
  {
    id: "account-checking",
    name: "Checking",
    nodeType: "account",
    parentId: undefined,
    groupId: "group-cash",
  },
  {
    id: "account-wallet",
    name: "Wallet",
    nodeType: "account",
    parentId: undefined,
    groupId: "group-assets",
  },
];

function getRowsFor(args: { mode: AccountsMode; tab: TabValue }): TreeRow[] {
  if (args.tab !== "ASSET") return [];
  return args.mode === "archived" ? archivedAssetRows : activeAssetRows;
}

function getPinnedBottomRowData(
  args: { tab: TabValue; mode: AccountsMode },
  referenceBalanceTotal: number | null,
): AccountsPageViewProps["pinnedBottomRowData"] {
  if (args.tab.startsWith("EQUITY-") || args.mode === "archived") {
    return undefined;
  }
  return [
    {
      id: REFERENCE_CURRENCY_TOTAL_FOOTER_ROW_ID,
      rowType: "referenceCurrencyTotalFooter" as const,
      name: "Total" as const,
      balanceInReferenceCurrency: referenceBalanceTotal,
    },
  ];
}

function AccountsPageStoryHarness({
  initialMode,
  initialTab = "ASSET",
  startWithCreateModal = false,
  startWithEditModal = false,
  routeSmoke = false,
}: {
  initialMode: AccountsMode;
  initialTab?: TabValue;
  startWithCreateModal?: boolean;
  startWithEditModal?: boolean;
  routeSmoke?: boolean;
}) {
  const [tabState, setTabState] = useState<TabValue>(initialTab);
  const [modeState, setModeState] = useState<AccountsMode>(initialMode);
  const [createModalOpened, setCreateModalOpened] =
    useState(startWithCreateModal);
  const [createGroupModalOpened, setCreateGroupModalOpened] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(startWithEditModal);
  const [editingAccount, setEditingAccount] = useState<
    { id: string; initialValues: AccountInitialValues } | undefined
  >(
    startWithEditModal
      ? {
          id: "account-checking",
          initialValues: {
            name: "Checking",
            type: AccountType.ASSET,
            groupId: "group-cash",
            sortOrder: 0,
            unit: Unit.CURRENCY,
            currency: "CHF",
          },
        }
      : undefined,
  );
  const [editGroupModalOpen, setEditGroupModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<
    { id: string; initialValues: AccountGroupInitialValues } | undefined
  >();
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

  const navigate = useNavigate();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const routeSearch = useRouterState({
    select: (state) => state.location.search,
  });
  const tab: TabValue =
    typeof routeSearch.tab === "string" &&
    tabs.some((candidate) => candidate.value === routeSearch.tab)
      ? (routeSearch.tab as TabValue)
      : tabState;
  const mode: AccountsMode =
    routeSearch.mode === "archived" ? "archived" : modeState;

  const rows = useMemo(() => getRowsFor({ mode, tab }), [mode, tab]);
  const rowsByParentKey = useRowsByParentKey(rows);
  const selectedSiblingRows: ReorderGroupChildRow[] = useSelectedSiblingRows(
    rowsByParentKey,
    reorderingRow,
  );
  const isEquityTab = tab.startsWith("EQUITY-");
  const balanceInReferenceCurrencyByGroupId =
    useBalanceInReferenceCurrencyByGroupId(rowsByParentKey, rows, !isEquityTab);
  const referenceCurrencyBalanceTotal = useReferenceCurrencyBalanceTotal(
    rows,
    !isEquityTab,
  );

  const columnDefs = useAccountTreeColumnDefs({
    isArchivedMode: mode === "archived",
    isEquityTab,
    rowsByParentKey,
    referenceCurrency: "CHF",
    isReferenceBalancesLoading: false,
    balanceInReferenceCurrencyByGroupId,
    onEditRow: (row) => {
      if (row.nodeType === "account") {
        setEditingAccount({
          id: row.id,
          initialValues: {
            name: row.name,
            type: row.type,
            equityAccountSubtype: row.equityAccountSubtype,
            groupId: row.groupId ?? undefined,
            sortOrder: row.sortOrder ?? undefined,
            unit: row.unit ?? Unit.CURRENCY,
            currency: row.currency ?? undefined,
            cryptocurrency: row.cryptocurrency ?? undefined,
            symbol: row.symbol ?? undefined,
            tradeCurrency: row.tradeCurrency ?? undefined,
          },
        });
        setEditModalOpen(true);
      }
      if (row.nodeType === "accountGroup") {
        setEditingGroup({
          id: row.id,
          initialValues: {
            name: row.name,
            type: row.type,
            equityAccountSubtype: row.equityAccountSubtype,
            parentGroupId: row.parentId,
            sortOrder: row.sortOrder ?? undefined,
          },
        });
        setEditGroupModalOpen(true);
      }
    },
    onUnarchiveRow: async () => {
      setModeState("active");
    },
    onArchiveRow: setArchivingRow,
    onDeleteRow: setDeletingRow,
    onReorderRow: setReorderingRow,
  });

  return (
    <Box
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100dvh",
      }}
    >
      <AccountsPageView
        accountBookId="storybook-book"
        tab={tab}
        mode={mode}
        tabs={tabs}
        accountGroups={accountGroups}
        existingNodes={existingNodes}
        unitUsage={{
          currencies: ["CHF", "EUR", "USD"],
          cryptocurrencies: ["BTC"],
        }}
        rows={rows}
        columnDefs={columnDefs}
        pinnedBottomRowData={getPinnedBottomRowData(
          { mode, tab },
          referenceCurrencyBalanceTotal,
        )}
        isGroupOpenByDefault={() => false}
        onRowGroupOpened={() => undefined}
        createModalOpened={createModalOpened}
        editModalOpen={editModalOpen}
        createGroupModalOpened={createGroupModalOpened}
        editGroupModalOpen={editGroupModalOpen}
        editingAccount={editingAccount}
        editingGroup={editingGroup}
        deletingRow={deletingRow}
        archivingRow={archivingRow}
        reorderingRow={reorderingRow}
        selectedSiblingRows={selectedSiblingRows}
        onOpenCreateGroup={() => setCreateGroupModalOpened(true)}
        onOpenCreateAccount={() => setCreateModalOpened(true)}
        onOpenLedger={(nextAccountId) => {
          if (routeSmoke) {
            navigate({
              to: "/$accountBookId/$accountId",
              params: {
                accountBookId: "storybook-book",
                accountId: nextAccountId,
              },
            });
          }
        }}
        onCloseCreateAccount={() => setCreateModalOpened(false)}
        onSubmitCreateAccount={async (_values: TransformedFormValues) => {
          setCreateModalOpened(false);
        }}
        onCloseEditAccount={() => setEditModalOpen(false)}
        onClearEditingAccount={() => setEditingAccount(undefined)}
        onSubmitUpdateAccount={async (_values: TransformedFormValues) => {
          setEditModalOpen(false);
        }}
        onCloseCreateGroup={() => setCreateGroupModalOpened(false)}
        onSubmitCreateGroup={async () => {
          setCreateGroupModalOpened(false);
        }}
        onCloseEditGroup={() => setEditGroupModalOpen(false)}
        onClearEditingGroup={() => setEditingGroup(undefined)}
        onSubmitUpdateGroup={async () => {
          setEditGroupModalOpen(false);
        }}
        onCloseDelete={() => setDeletingRow(undefined)}
        onConfirmDelete={async () => {
          setDeletingRow(undefined);
        }}
        onCloseArchive={() => setArchivingRow(undefined)}
        onConfirmArchive={async () => {
          setArchivingRow(undefined);
        }}
        onCloseReorder={() => setReorderingRow(undefined)}
        onReorderSiblings={async () => {
          setReorderingRow(undefined);
        }}
      />
      {routeSmoke ? (
        <>
          <Text data-testid="router-path">{pathname}</Text>
          <Text data-testid="router-search">{JSON.stringify(routeSearch)}</Text>
        </>
      ) : null}
    </Box>
  );
}

const meta: Meta<typeof AccountsPageView> = {
  title: "Routes/AccountsPageView",
  component: AccountsPageView,
};

export default meta;

type Story = StoryObj<typeof meta>;

export const ActiveHappyPath: Story = {
  render: () => <AccountsPageStoryHarness initialMode="active" />,
};

export const ArchivedMode: Story = {
  render: () => <AccountsPageStoryHarness initialMode="archived" />,
};

export const ArchivedModeActions: Story = {
  render: () => <AccountsPageStoryHarness initialMode="archived" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const walletCell = canvas.getByText("Wallet");
    const walletRow = walletCell.closest(".ag-row");
    if (!walletRow) throw new Error("Could not resolve Wallet row");
    const walletRowQueries = within(walletRow as HTMLElement);

    await userEvent.click(
      walletRowQueries.getByRole("button", { name: "Edit" }),
    );
    const editDialog = body.getByRole("dialog", { name: "Edit Account" });
    await expect(editDialog).toBeInTheDocument();
    await userEvent.click(
      within(editDialog).getByRole("button", { name: "Save" }),
    );

    await userEvent.click(
      walletRowQueries.getByRole("button", { name: "Delete" }),
    );
    const deleteDialog = body.getByRole("dialog", { name: "Delete Account" });
    await expect(deleteDialog).toBeInTheDocument();
    await userEvent.click(
      within(deleteDialog).getByRole("button", { name: "Cancel" }),
    );

    await userEvent.click(
      walletRowQueries.getByRole("button", { name: "Reorder Siblings" }),
    );
    const reorderDialog = body.getByRole("dialog", {
      name: "Reorder Siblings",
    });
    await expect(reorderDialog).toBeInTheDocument();
    await userEvent.click(
      within(reorderDialog).getByRole("button", { name: "Close" }),
    );
  },
};

export const CreateModalOpen: Story = {
  render: () => (
    <AccountsPageStoryHarness
      initialMode="active"
      startWithCreateModal={true}
    />
  ),
};

export const EditModalOpen: Story = {
  render: () => (
    <AccountsPageStoryHarness initialMode="active" startWithEditModal={true} />
  ),
};

export const RouteSmoke: Story = {
  render: () => (
    <AccountsPageStoryHarness initialMode="active" routeSmoke={true} />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("link", { name: "Archive" }),
    ).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("link", { name: "Archive" }));
    await expect(canvas.getByTestId("router-search")).toHaveTextContent(
      '"mode":"archived"',
    );
    await expect(
      canvas.getByRole("heading", { name: "Archived Accounts" }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("link", { name: "Active Accounts" }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: "Add Group" }),
    ).toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole("link", { name: "Active Accounts" }),
    );
    await expect(canvas.getByTestId("router-search")).toHaveTextContent(
      '"mode":"active"',
    );
  },
};
