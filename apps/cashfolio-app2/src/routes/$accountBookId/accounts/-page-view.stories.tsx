import { buildUnifiedAccountTreeRows } from "@/shared/archived-account-tree-rows";
import type { AccountGainLossSummaries } from "@/shared/account-gain-loss";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Box, Button, Text } from "@mantine/core";
import { useMemo, useState } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { AccountType, Unit } from "@/.prisma-client/enums";
import type { AccountGroupInitialValues } from "@/components/account-editor/edit-account-group-modal";
import type {
  AccountInitialValues,
  TransformedFormValues,
} from "@/components/account-editor/edit-account-modal";
import type { ReorderGroupChildRow } from "@/components/account-tree/reorder-group-children-modal";
import { useAccountTreeColumnDefs } from "./-page-columns";
import {
  useBalanceInReferenceCurrencyByGroupId,
  useReferenceCurrencyBalanceTotal,
  useRowsByParentKey,
  useSelectedSiblingRows,
} from "./-page-data";
import { AccountsPageView, type AccountsPageViewProps } from "./-page-view";
import { UserLocaleProvider } from "@/user-locale-context";
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
  createAccountRow({
    id: "account-holding",
    name: "USD Holding",
    groupId: "group-assets",
    type: AccountType.ASSET,
    isActive: true,
    sortOrder: 2,
    currency: "USD",
    balance: 100,
    balanceInReferenceCurrency: 90,
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
    isCashAccount: false,
    parentGroupId: null,
    treePath: [],
    treeLabel: "Assets",
  },
  {
    value: "group-cash",
    label: "Assets / Cash",
    type: AccountType.ASSET,
    equityAccountSubtype: null,
    isCashAccount: true,
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
    type: AccountType.ASSET,
  },
  {
    id: "group-cash",
    name: "Cash",
    nodeType: "accountGroup",
    parentId: "group-assets",
    groupId: undefined,
    type: AccountType.ASSET,
  },
  {
    id: "account-checking",
    name: "Checking",
    nodeType: "account",
    parentId: undefined,
    groupId: "group-cash",
    type: AccountType.ASSET,
    unit: Unit.CURRENCY,
  },
  {
    id: "account-wallet",
    name: "Wallet",
    nodeType: "account",
    parentId: undefined,
    groupId: "group-assets",
    type: AccountType.ASSET,
    unit: Unit.CURRENCY,
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
  if (args.tab.startsWith("EQUITY-")) {
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
  rowsOverride,
  expandGroups = false,
  gainLossState: initialGainLossState = "ready",
  toggleGainLossLoading = false,
  initialMode,
  initialTab = "ASSET",
  startWithCreateModal = false,
  startWithEditModal = false,
  routeSmoke = false,
}: {
  rowsOverride?: TreeRow[];
  expandGroups?: boolean;
  gainLossState?: "ready" | "loading" | "error" | "partial";
  toggleGainLossLoading?: boolean;
  initialMode: AccountsMode;
  initialTab?: TabValue;
  startWithCreateModal?: boolean;
  startWithEditModal?: boolean;
  routeSmoke?: boolean;
}) {
  const [gainLossState, setGainLossState] = useState(initialGainLossState);
  const [tabState] = useState<TabValue>(initialTab);
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

  const rows = useMemo(
    () =>
      buildUnifiedAccountTreeRows(rowsOverride ?? getRowsFor({ mode, tab })),
    [mode, tab, rowsOverride],
  );
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

  const gainLossData: AccountGainLossSummaries = {
    referenceCurrency: "CHF",
    startDate: "2026-01-01Z",
    asOfDate: "2026-03-31Z",
    rows: rows.map((row) => ({
      id: row.id,
      applicable: row.id === "account-holding" || row.id === "group-assets",
      summary:
        row.id === "account-holding" || row.id === "group-assets"
          ? {
              realizedGainLoss: 20,
              unrealizedGainLoss: gainLossState === "partial" ? null : -10,
              totalGainLoss: gainLossState === "partial" ? null : 10,
            }
          : {
              realizedGainLoss: null,
              unrealizedGainLoss: null,
              totalGainLoss: null,
            },
      diagnostics:
        gainLossState === "partial"
          ? [
              {
                date: "2026-03-31Z",
                message: "Closing valuation is unavailable.",
              },
            ]
          : [],
    })),
    total: {
      applicable: true,
      summary: {
        realizedGainLoss: 20,
        unrealizedGainLoss: gainLossState === "partial" ? null : -10,
        totalGainLoss: gainLossState === "partial" ? null : 10,
      },
      diagnostics: [],
    },
  };
  const columnDefs = useAccountTreeColumnDefs({
    gainLossData:
      gainLossState === "loading" || gainLossState === "error"
        ? undefined
        : gainLossData,
    isGainLossLoading: gainLossState === "loading",
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
            parentGroupId: row.persistedParentId ?? undefined,
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
        height: "100dvh",
      }}
    >
      {toggleGainLossLoading && (
        <Button
          onClick={() =>
            setGainLossState((state) =>
              state === "loading" ? "ready" : "loading",
            )
          }
        >
          Toggle gain/loss loading
        </Button>
      )}
      <AccountsPageView
        gainLoss={{
          data:
            gainLossState === "loading" || gainLossState === "error"
              ? undefined
              : gainLossData,
          loading: gainLossState === "loading",
          error:
            gainLossState === "error"
              ? "Gain/loss could not be loaded. Please try again."
              : undefined,
          retry: () => setGainLossState("ready"),
        }}
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
        isGroupOpenByDefault={() => expandGroups || initialMode === "archived"}
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

async function findVisibleDialog(
  body: ReturnType<typeof within>,
  name: string,
) {
  const dialog = await body.findByRole("dialog", { name });
  await waitFor(() => expect(dialog).toBeVisible());
  return dialog;
}

async function openGainLossDetails(canvasElement: HTMLElement) {
  await userEvent.click(
    await within(canvasElement).findByRole("button", {
      name: "Show gain/loss details",
    }),
  );
  return findVisibleDialog(
    within(canvasElement.ownerDocument.body),
    "Gain/loss details",
  );
}

export const ActiveHappyPath: Story = {
  render: () => <AccountsPageStoryHarness initialMode="active" />,
};

export const ConstrainedWidthWithGainLoss: Story = {
  render: () => (
    <Box w={960} maw="100%">
      <AccountsPageStoryHarness
        initialMode="active"
        expandGroups
        rowsOverride={activeAssetRows.map((row) => ({
          ...row,
          name:
            row.id === "group-cash"
              ? "Cash and savings accounts"
              : row.id === "account-checking"
                ? "Household current account"
                : row.id === "account-holding"
                  ? "US dollar investment holdings"
                  : row.name,
        }))}
      />
    </Box>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const nameHeader = await canvas.findByRole("columnheader", {
      name: "Name",
    });
    await waitFor(() => {
      expect(nameHeader.getBoundingClientRect().width).toBeGreaterThanOrEqual(
        320,
      );
      expect(canvas.getByText("Household current account")).toBeVisible();
    });
    const viewport = canvasElement.querySelector(".ag-grid-viewport");
    if (!viewport) throw new Error("Could not resolve Accounts viewport");
    expect(viewport.scrollWidth).toBeGreaterThan(viewport.clientWidth);
    viewport.scrollLeft = viewport.scrollWidth;
    await waitFor(() => {
      expect(
        canvas.getByRole("columnheader", { name: "Unrealised" }),
      ).toBeVisible();
      expect(
        canvas.getAllByRole("button", { name: "Edit" }).length,
      ).toBeGreaterThan(0);
    });
    await userEvent.click(
      canvas.getByRole("button", { name: "Show gain/loss details" }),
    );
    const details = await within(canvasElement.ownerDocument.body).findByRole(
      "dialog",
      { name: "Gain/loss details" },
    );
    await waitFor(() => {
      const bounds = details.getBoundingClientRect();
      expect(bounds.left).toBeGreaterThanOrEqual(0);
      expect(bounds.right).toBeLessThanOrEqual(
        canvasElement.ownerDocument.documentElement.clientWidth,
      );
    });
    await userEvent.keyboard("{Escape}");
    viewport.scrollLeft = 0;
  },
};

export const ArchivedGroups: Story = {
  render: () => <AccountsPageStoryHarness initialMode="archived" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Show gain/loss details" }),
    );
    const details = await within(canvasElement.ownerDocument.body).findByRole(
      "dialog",
      { name: "Gain/loss details" },
    );
    expect(details).toHaveTextContent(
      "Totals include active and archived accounts",
    );
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(details).not.toBeVisible());
  },
};

export const ArchivedGroupActions: Story = {
  render: () => <AccountsPageStoryHarness initialMode="archived" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const getWalletRowQueries = async () => {
      const walletCell = await canvas.findByText("Wallet", undefined, {
        timeout: 10000,
      });
      const walletRow = walletCell.closest(".ag-row");
      if (!walletRow) throw new Error("Could not resolve Wallet row");
      return within(walletRow as HTMLElement);
    };

    let walletRowQueries = await getWalletRowQueries();
    await userEvent.click(
      await walletRowQueries.findByRole("button", { name: "Edit" }),
    );
    const editDialog = await findVisibleDialog(body, "Edit Account");
    await userEvent.click(
      within(editDialog).getByRole("button", { name: "Save" }),
    );
    await waitFor(() => {
      expect(
        body.queryByRole("dialog", { name: "Edit Account" }),
      ).not.toBeInTheDocument();
    });

    walletRowQueries = await getWalletRowQueries();
    await userEvent.click(
      await walletRowQueries.findByRole("button", { name: "Delete" }),
    );
    const deleteDialog = await findVisibleDialog(body, "Delete Account");
    await userEvent.click(
      within(deleteDialog).getByRole("button", { name: "Cancel" }),
    );
    await waitFor(() => {
      expect(
        body.queryByRole("dialog", { name: "Delete Account" }),
      ).not.toBeInTheDocument();
    });

    walletRowQueries = await getWalletRowQueries();
    await userEvent.click(
      await walletRowQueries.findByRole("button", {
        name: "Reorder Siblings",
      }),
    );
    const reorderDialog = await findVisibleDialog(body, "Reorder Siblings");
    await userEvent.click(
      within(reorderDialog).getByRole("button", { name: "Close" }),
    );
    await waitFor(() => {
      expect(
        body.queryByRole("dialog", { name: "Reorder Siblings" }),
      ).not.toBeInTheDocument();
    });
  },
};

export const VirtualArchivedAppearance: Story = {
  render: () => (
    <AccountsPageStoryHarness
      initialMode="active"
      rowsOverride={[
        createGroupRow({
          id: "real-archived",
          name: "Archived",
          type: AccountType.ASSET,
          isActive: true,
          sortOrder: 0,
        }),
        createAccountRow({
          id: "closed-wallet",
          name: "Closed wallet",
          type: AccountType.ASSET,
          isActive: false,
          sortOrder: 1,
          currency: "CHF",
          balance: 0,
          balanceInReferenceCurrency: 0,
        }),
      ]}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findAllByText("Archived", { exact: true });
    const label = canvasElement.querySelector<HTMLElement>(
      "[data-virtual-archived-label]",
    );
    if (!label) throw new Error("Missing virtual Archived label");
    const row = label.closest<HTMLElement>(".ag-row");
    const cell = label.closest<HTMLElement>(".ag-cell");
    if (!row || !cell) throw new Error("Missing Archived row");
    expect(label.querySelector('svg[aria-hidden="true"]')).toHaveAttribute(
      "width",
      "16",
    );
    expect(
      canvasElement.querySelectorAll("[data-virtual-archived-label]"),
    ).toHaveLength(1);
    const numeric = row.querySelector<HTMLElement>(
      '[col-id="balanceInReferenceCurrency"]',
    );
    if (!numeric) throw new Error("Missing reference balance cell");
    expect(getComputedStyle(label).color).not.toBe(
      getComputedStyle(numeric).color,
    );
    const realLabel = canvasElement.querySelector<HTMLElement>(
      '[row-id="real-archived"] .ag-group-value',
    );
    const chevron = row.querySelector<HTMLElement>(".ag-group-contracted");
    if (!realLabel || !chevron) throw new Error("Missing ordinary tree cells");
    expect(realLabel).toHaveTextContent("Archived");
    expect(realLabel.querySelector("svg")).toBeNull();
    expect(getComputedStyle(realLabel).color).toBe(
      getComputedStyle(numeric).color,
    );
    expect(getComputedStyle(chevron).color).toBe(
      getComputedStyle(numeric).color,
    );
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.hover(label);
    expect(await body.findByRole("tooltip")).toHaveTextContent(
      "Archived items grouped automatically. Included in totals.",
    );
    await userEvent.unhover(label);
    cell.focus();
    await userEvent.tab();
    expect(label).toHaveFocus();
    expect(await body.findByRole("tooltip")).toHaveTextContent(
      "Archived items grouped automatically. Included in totals.",
    );
    await userEvent.tab({ shift: true });
    expect(cell).toHaveFocus();
    const expand = row.querySelector<HTMLElement>(".ag-group-contracted");
    if (!expand) throw new Error("Missing Archived expander");
    await userEvent.click(expand);
    expect(await canvas.findByText("Closed wallet")).toBeVisible();
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
  parameters: {
    router: {
      initialPath: "/storybook-book/accounts?tab=ASSET&mode=active",
    },
  },
  render: () => (
    <AccountsPageStoryHarness initialMode="active" routeSmoke={true} />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(
      canvas.queryByRole("link", { name: "Archive" }),
    ).not.toBeInTheDocument();
    expect(
      canvas.getByRole("heading", { name: "Accounts" }),
    ).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("tab", { name: "Expense" }));
    await expect(canvas.getByTestId("router-search")).toHaveTextContent(
      '"tab":"EQUITY-EXPENSE"',
    );
    await expect(canvas.getByTestId("router-search")).toHaveTextContent(
      '"mode":"active"',
    );
  },
};

export const GainLossLoading: Story = {
  render: () => (
    <AccountsPageStoryHarness initialMode="active" gainLossState="loading" />
  ),
  play: async ({ canvasElement }) => {
    const details = await openGainLossDetails(canvasElement);
    expect(details).toHaveTextContent("Loading calculation dates…");
    expect(details).toHaveTextContent(
      "Totals include active and archived accounts",
    );
    await userEvent.keyboard("{Escape}");
  },
};

export const GainLossLoadingToReady: Story = {
  render: () => (
    <AccountsPageStoryHarness
      initialMode="active"
      gainLossState="loading"
      toggleGainLossLoading
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    let header = await canvas.findByRole("columnheader", {
      name: /G\/L Since Start \(CHF\)/,
    });
    await canvas.findByText("Assets", { exact: true });
    const grid = canvasElement.querySelector(".ag-root-wrapper");
    const firstRow = canvasElement.querySelector('.ag-row[row-index="0"]');
    if (!grid || !firstRow) throw new Error("Accounts grid has no first row");
    expect(grid.getBoundingClientRect().height).toBeGreaterThan(100);
    const gridTop = grid.getBoundingClientRect().top;
    const rowTop = firstRow.getBoundingClientRect().top;
    const headerBounds = header.getBoundingClientRect();
    expect(header).not.toHaveTextContent(/2026|Loading|unavailable/);
    await userEvent.click(
      canvas.getByRole("button", { name: "Toggle gain/loss loading" }),
    );
    await waitFor(() =>
      expect(
        firstRow.querySelector('[col-id="totalGainLoss"]'),
      ).toHaveTextContent("10.00"),
    );
    header = canvas.getByRole("columnheader", {
      name: /G\/L Since Start \(CHF\)/,
    });
    expect(grid.getBoundingClientRect().top).toBe(gridTop);
    expect(firstRow.getBoundingClientRect().top).toBe(rowTop);
    expect(header.getBoundingClientRect().top).toBe(headerBounds.top);
    expect(header.getBoundingClientRect().height).toBe(headerBounds.height);
    expect(header).not.toHaveTextContent(/2026|Loading|unavailable/);

    header.focus();
    await userEvent.tab();
    const button = canvas.getByRole("button", {
      name: "Show gain/loss details",
    });
    expect(button).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    const details = await within(canvasElement.ownerDocument.body).findByRole(
      "dialog",
      { name: "Gain/loss details" },
    );
    expect(details).toHaveTextContent("Since 1/1/2026 · As of 3/31/2026");
    expect(details).toHaveTextContent("Incomplete columns show —");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(details).not.toBeVisible());
    expect(button).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(header).toHaveFocus();
    await userEvent.tab();
    await userEvent.tab();
    expect(button).not.toHaveFocus();

    await userEvent.click(
      canvas.getByRole("button", { name: "Toggle gain/loss loading" }),
    );
    const loadingDetails = await openGainLossDetails(canvasElement);
    header = canvas.getByRole("columnheader", {
      name: /G\/L Since Start \(CHF\)/,
    });
    expect(loadingDetails).toHaveTextContent("Loading calculation dates…");
    expect(loadingDetails).not.toHaveTextContent("Since 1/1/2026");
    expect(grid.getBoundingClientRect().top).toBe(gridTop);
    expect(firstRow.getBoundingClientRect().top).toBe(rowTop);
    expect(header.getBoundingClientRect().top).toBe(headerBounds.top);
    expect(header.getBoundingClientRect().height).toBe(headerBounds.height);
    await userEvent.keyboard("{Escape}");
  },
};

export const GainLossCompletesWithDetailsOpen: Story = {
  render: () => (
    <AccountsPageStoryHarness
      initialMode="active"
      gainLossState="loading"
      toggleGainLossLoading
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const header = await canvas.findByRole("columnheader", {
      name: /G\/L Since Start \(CHF\)/,
    });
    header.focus();
    await userEvent.tab();
    await userEvent.keyboard("{Enter}");
    const details = await findVisibleDialog(body, "Gain/loss details");
    expect(details).toHaveTextContent("Loading calculation dates…");
    await waitFor(() =>
      expect(details.contains(canvasElement.ownerDocument.activeElement)).toBe(
        true,
      ),
    );

    // Resolve the simulated request without an outside pointer event or focus change.
    const toggleLoading = canvas.getByRole("button", {
      name: "Toggle gain/loss loading",
    });
    toggleLoading.click();
    await waitFor(() =>
      expect(
        canvasElement.querySelector(
          '.ag-row[row-index="0"] [col-id="totalGainLoss"]',
        ),
      ).toHaveTextContent("10.00"),
    );
    await waitFor(() =>
      expect(details).toHaveTextContent("Since 1/1/2026 · As of 3/31/2026"),
    );
    expect(details.isConnected).toBe(true);
    expect(body.getByRole("dialog", { name: "Gain/loss details" })).toBe(
      details,
    );
    expect(details.contains(canvasElement.ownerDocument.activeElement)).toBe(
      true,
    );

    toggleLoading.click();
    await waitFor(() =>
      expect(
        canvasElement.querySelector(
          '.ag-row[row-index="0"] [col-id="totalGainLoss"] .mantine-Loader-root',
        ),
      ).toBeVisible(),
    );
    await waitFor(() =>
      expect(details).toHaveTextContent("Loading calculation dates…"),
    );
    expect(details).not.toHaveTextContent("Since 1/1/2026");
    expect(details.contains(canvasElement.ownerDocument.activeElement)).toBe(
      true,
    );
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(details).not.toBeVisible());
    expect(
      canvas.getByRole("button", { name: "Show gain/loss details" }),
    ).toHaveFocus();
  },
};

export const GainLossFailure: Story = {
  render: () => (
    <AccountsPageStoryHarness initialMode="active" gainLossState="error" />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.queryByText("Dates unavailable")).not.toBeInTheDocument();
    const details = await openGainLossDetails(canvasElement);
    expect(details).toHaveTextContent("Dates unavailable");
    await userEvent.keyboard("{Escape}");
    await userEvent.click(canvas.getByRole("button", { name: "Retry" }));
    const readyDetails = await openGainLossDetails(canvasElement);
    expect(readyDetails).toHaveTextContent("Since 1/1/2026 · As of 3/31/2026");
    expect(canvas.queryByText("Gain/Loss Unavailable")).not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
  },
};
export const GainLossPartial: Story = {
  render: () => (
    <AccountsPageStoryHarness initialMode="active" gainLossState="partial" />
  ),
  play: async ({ canvasElement }) => {
    const details = await openGainLossDetails(canvasElement);
    expect(details).toHaveTextContent("Since 1/1/2026 · As of 3/31/2026");
    await userEvent.keyboard("{Escape}");
  },
};

export const LocalizedLiabilityGainLoss: Story = {
  render: () => (
    <UserLocaleProvider locale="de-CH">
      <AccountsPageStoryHarness initialMode="active" initialTab="LIABILITY" />
    </UserLocaleProvider>
  ),
  play: async ({ canvasElement }) => {
    const details = await openGainLossDetails(canvasElement);
    expect(details).toHaveTextContent("Since 1.1.2026 · As of 31.3.2026");
    await userEvent.keyboard("{Escape}");
  },
};
