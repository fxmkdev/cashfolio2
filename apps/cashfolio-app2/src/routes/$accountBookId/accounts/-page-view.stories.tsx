import { useBulkAccountActions } from "./-use-bulk-account-actions";
import type { GridApi } from "ag-grid-enterprise";
import type { AccountsGridRow } from "./-page-types";
import type { AssetClass } from "@/.prisma-client/enums";
import { ACCOUNT_BOOK_BUSY_MESSAGE } from "@/shared/mutation-errors";
import { isVirtualArchivedGroup } from "./-archived-grid-rows";
import { buildUnifiedAccountTreeRows } from "@/shared/archived-account-tree-rows";
import { SettingsNavigation } from "../settings/-settings-navigation";
import type { AccountGainLossSummaries } from "@/shared/account-gain-loss";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Box, Button, Text } from "@mantine/core";
import { useMemo, useRef, useState } from "react";
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
  getManagementTabs,
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
    type: AccountType.BALANCE,
    isActive: true,
    sortOrder: 0,
  }),
  createGroupRow({
    id: "group-cash",
    name: "Cash",
    parentId: "group-assets",
    type: AccountType.BALANCE,
    isActive: true,
    sortOrder: 0,
  }),
  createAccountRow({
    id: "account-checking",
    name: "Checking",
    groupId: "group-cash",
    type: AccountType.BALANCE,
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
    type: AccountType.BALANCE,
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
    type: AccountType.BALANCE,
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
    type: AccountType.BALANCE,
    equityAccountSubtype: null,
    isCashAccount: false,
    parentGroupId: null,
    treePath: [],
    treeLabel: "Assets",
  },
  {
    value: "group-cash",
    label: "Assets / Cash",
    type: AccountType.BALANCE,
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
    type: AccountType.BALANCE,
  },
  {
    id: "group-cash",
    name: "Cash",
    nodeType: "accountGroup",
    parentId: "group-assets",
    groupId: undefined,
    type: AccountType.BALANCE,
  },
  {
    id: "account-checking",
    name: "Checking",
    nodeType: "account",
    parentId: undefined,
    groupId: "group-cash",
    type: AccountType.BALANCE,
    unit: Unit.CURRENCY,
  },
  {
    id: "account-wallet",
    name: "Wallet",
    nodeType: "account",
    parentId: undefined,
    groupId: "group-assets",
    type: AccountType.BALANCE,
    unit: Unit.CURRENCY,
  },
];

function getRowsFor(args: {
  mode: AccountsMode;
  tab: TabValue;
  showArchived?: boolean;
}): TreeRow[] {
  if (args.tab.startsWith("EQUITY-")) {
    const active = activeAssetRows.slice(0, 4).map((row, i) => ({
      ...row,
      name: ["Housing", "Utilities", "Electricity", "Rent"][i],
      type: AccountType.EQUITY,
      equityAccountSubtype:
        args.tab === "EQUITY-INCOME"
          ? ("INCOME" as const)
          : ("EXPENSE" as const),
      unit: null,
      currency: null,
      balance: null,
      balanceInReferenceCurrency: null,
      isActive: true,
      archivable: true,
      unarchivable: false,
      ...(i === 2
        ? {
            deletable: false,
            deleteDisabledReason:
              "Cannot delete account because it has bookings",
          }
        : {}),
    }));
    if (!args.showArchived) return active;
    return [
      ...active,
      {
        ...active[2],
        id: "archived-category-root",
        name: "Old Category",
        parentId: undefined,
        groupId: undefined,
        isActive: false,
        archivable: false,
        unarchivable: true,
      },
      {
        ...active[1],
        id: "archived-category-group",
        name: "Former Categories",
        parentId: active[0].id,
        isActive: false,
        archivable: false,
        unarchivable: true,
      },
      {
        ...active[2],
        id: "archived-category-child",
        name: "Old Child Category",
        parentId: "archived-category-group",
        groupId: "archived-category-group",
        isActive: false,
        archivable: false,
        unarchivable: false,
      },
    ];
  }
  if (args.tab !== "BALANCE") return [];
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
  bulkAssignment = false,
  assignmentFailsOnce = false,
  rowsOverride,
  expandGroups = false,
  gainLossState: initialGainLossState = "ready",
  toggleGainLossLoading = false,
  initialMode,
  initialTab = "BALANCE",
  startWithCreateModal = false,
  startWithEditModal = false,
  routeSmoke = false,
}: {
  bulkAssignment?: boolean;
  assignmentFailsOnce?: boolean;
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
  const [assignmentScope, setAssignmentScope] = useState("first");
  const bulkApiRef = useRef<GridApi<AccountsGridRow> | null>(null);
  const hasFailed = useRef(false);
  const [assetClasses, setAssetClasses] = useState<
    Record<string, AssetClass | null>
  >({});
  const [submittedAccountIds, setSubmittedAccountIds] = useState<string[]>([]);
  const [refreshCount, setRefreshCount] = useState(0);
  const [invalidationCount, setInvalidationCount] = useState(0);
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
            type: AccountType.BALANCE,
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

  const showArchived = routeSearch.showArchived === true;
  const rows = useMemo(() => {
    const sourceRows = (
      rowsOverride ?? getRowsFor({ mode, tab, showArchived })
    ).map((row) => ({
      ...row,
      ...(Object.hasOwn(assetClasses, row.id)
        ? { assetClass: assetClasses[row.id] }
        : {}),
    }));
    return tab.startsWith("EQUITY-") && !showArchived
      ? sourceRows
      : buildUnifiedAccountTreeRows(sourceRows);
  }, [mode, tab, showArchived, rowsOverride, assetClasses]);
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
  const assignment = useBulkAccountActions({
    scopeKey: `${assignmentScope}:${tab}:${mode}`,
    enabled: bulkAssignment && !isEquityTab,
    rows,
    submitAssetClass: async (accountIds, assetClass) => {
      if (assignmentFailsOnce && !hasFailed.current) {
        hasFailed.current = true;
        throw new Error(ACCOUNT_BOOK_BUSY_MESSAGE);
      }
      setSubmittedAccountIds(accountIds);
      setAssetClasses((current) => ({
        ...current,
        ...Object.fromEntries(accountIds.map((id) => [id, assetClass])),
      }));
    },
    invalidate: () => setInvalidationCount((count) => count + 1),
    onRefreshConstraints: async () => {
      setRefreshCount((count) => count + 1);
    },
  });
  const columnDefs = useAccountTreeColumnDefs({
    gainLossData:
      isEquityTab || gainLossState === "loading" || gainLossState === "error"
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
            parentGroupId:
              (row.persistedParentId === undefined
                ? row.parentId
                : row.persistedParentId) ?? undefined,
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
      {bulkAssignment && (
        <>
          <Button
            onClick={() =>
              bulkApiRef.current?.setFilterModel({
                "ag-Grid-AutoColumn": {
                  filterType: "text",
                  type: "equals",
                  filter: "Checking",
                },
              })
            }
          >
            Filter to Checking
          </Button>
          <Button onClick={() => bulkApiRef.current?.setFilterModel(null)}>
            Clear Account Filters
          </Button>
          <Text data-testid="assignment-account-ids">
            {submittedAccountIds.join(",")}
          </Text>
          <Button onClick={() => setAssignmentScope("second")}>
            Change Account Book
          </Button>
          <Text data-testid="assignment-refreshes">
            Refreshes: {refreshCount}; invalidations: {invalidationCount}
          </Text>
        </>
      )}
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
      {isEquityTab && (
        <SettingsNavigation accountBookId="storybook-book" categories />
      )}
      <AccountsPageView
        bulkAccountActions={
          bulkAssignment && !isEquityTab ? assignment : undefined
        }
        onGridReady={({ api }) => {
          bulkApiRef.current = api;
        }}
        gainLoss={{
          data:
            gainLossState === "loading" ||
            (!isEquityTab && gainLossState === "error")
              ? undefined
              : gainLossData,
          loading: !isEquityTab && gainLossState === "loading",
          error:
            gainLossState === "error"
              ? "Gain/loss could not be loaded. Please try again."
              : undefined,
          retry: () => setGainLossState("ready"),
        }}
        accountBookId="storybook-book"
        tab={tab}
        mode={mode}
        showArchived={showArchived}
        onShowArchivedChange={(value) => {
          void navigate({
            to: "/$accountBookId/settings/categories",
            params: { accountBookId: "storybook-book" },
            search: { tab, showArchived: value },
          });
        }}
        managementContext={isEquityTab ? "categories" : "accounts"}
        tabs={getManagementTabs(isEquityTab ? "categories" : "accounts")}
        accountGroups={
          isEquityTab
            ? rows
                .filter((row) => row.nodeType === "accountGroup")
                .map((row) => ({
                  value: row.id,
                  label: row.name,
                  type: row.type,
                  equityAccountSubtype: row.equityAccountSubtype,
                  parentGroupId: row.parentId ?? null,
                  isCashAccount: false,
                  treePath: row.parentId ? ["Housing"] : [],
                  treeLabel: row.name,
                }))
            : accountGroups
        }
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
        isGroupOpenByDefault={({ rowNode }) =>
          isEquityTab && isVirtualArchivedGroup(rowNode.data)
            ? false
            : expandGroups || initialMode === "archived"
        }
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
      name: "Show Gain/Loss Details",
    }),
  );
  return findVisibleDialog(
    within(canvasElement.ownerDocument.body),
    "Gain/Loss Details",
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
    const resizeHandle = nameHeader.querySelector<HTMLElement>(
      ".ag-header-cell-resize",
    );
    if (!resizeHandle) throw new Error("Missing Name column resize handle");
    const bounds = resizeHandle.getBoundingClientRect();
    const startX = bounds.left + bounds.width / 2;
    const clientY = bounds.top + bounds.height / 2;
    await userEvent.pointer([
      {
        target: resizeHandle,
        coords: { clientX: startX, clientY },
        keys: "[MouseLeft>]",
      },
      { target: resizeHandle, coords: { clientX: startX + 100, clientY } },
      { keys: "[/MouseLeft]" },
    ]);
    await waitFor(() =>
      expect(nameHeader.getBoundingClientRect().width).toBe(420),
    );
    const viewport = canvasElement.querySelector(".ag-grid-viewport");
    if (!viewport) throw new Error("Could not resolve Accounts viewport");
    expect(viewport.scrollWidth).toBeGreaterThan(viewport.clientWidth);
    const nameCell = canvas
      .getByText("Household current account")
      .closest<HTMLElement>(".ag-cell");
    const accountRow = nameCell?.closest<HTMLElement>(".ag-row");
    const actionsCell =
      accountRow?.querySelector<HTMLElement>('[col-id="actions"]');
    if (!nameCell || !accountRow || !actionsCell)
      throw new Error("Could not resolve account name and actions cells");
    const initialNameLeft = nameCell.getBoundingClientRect().left;
    const initialActionsRight = actionsCell.getBoundingClientRect().right;
    expect(initialNameLeft).toBeGreaterThanOrEqual(
      viewport.getBoundingClientRect().left,
    );
    expect(initialActionsRight).toBeLessThanOrEqual(
      viewport.getBoundingClientRect().right,
    );
    viewport.scrollLeft = viewport.scrollWidth;
    await waitFor(() => {
      expect(viewport.scrollLeft).toBeGreaterThan(0);
      expect(nameCell.getBoundingClientRect().left).toBeCloseTo(
        initialNameLeft,
        0,
      );
      expect(actionsCell.getBoundingClientRect().right).toBeCloseTo(
        initialActionsRight,
        0,
      );
      expect(canvas.getByText("Household current account")).toBeVisible();
      expect(
        canvas.getByRole("columnheader", { name: "Unrealised" }),
      ).toBeVisible();
    });
    await userEvent.hover(nameCell);
    await waitFor(() => expect(actionsCell).toHaveStyle({ opacity: "1" }));
    await userEvent.click(
      within(accountRow).getByRole("button", { name: "Edit" }),
    );
    const body = within(canvasElement.ownerDocument.body);
    const editDialog = await findVisibleDialog(body, "Edit Account");
    expect(nameHeader.getBoundingClientRect().width).toBe(420);
    await userEvent.click(
      within(editDialog).getByRole("button", { name: "Cancel" }),
    );
    await waitFor(() => expect(editDialog).not.toBeInTheDocument());
    expect(nameHeader.getBoundingClientRect().width).toBe(420);
    const groupRow = canvas
      .getByText("Cash and savings accounts")
      .closest<HTMLElement>(".ag-row");
    const collapse = groupRow?.querySelector<HTMLElement>(".ag-group-expanded");
    if (!groupRow || !collapse) throw new Error("Missing Cash group expander");
    await userEvent.click(collapse);
    await waitFor(() =>
      expect(
        canvas.queryByText("Household current account"),
      ).not.toBeInTheDocument(),
    );
    const expand = groupRow.querySelector<HTMLElement>(".ag-group-contracted");
    if (!expand) throw new Error("Missing Cash group expander");
    await userEvent.click(expand);
    await waitFor(() =>
      expect(canvas.getByText("Household current account")).toBeVisible(),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Show Gain/Loss Details" }),
    );
    const details = await within(canvasElement.ownerDocument.body).findByRole(
      "dialog",
      { name: "Gain/Loss Details" },
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
      await canvas.findByRole("button", { name: "Show Gain/Loss Details" }),
    );
    const details = await within(canvasElement.ownerDocument.body).findByRole(
      "dialog",
      { name: "Gain/Loss Details" },
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
      const viewport =
        canvasElement.querySelector<HTMLElement>(".ag-grid-viewport");
      if (!viewport)
        throw new Error("Could not resolve the account grid viewport");
      viewport.scrollLeft = 0;
      const walletCell = await canvas.findByText("Wallet", undefined, {
        timeout: 10000,
      });
      const walletRow = walletCell.closest(".ag-row");
      if (!walletRow) throw new Error("Could not resolve Wallet row");
      viewport.scrollLeft = viewport.scrollWidth;
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
          type: AccountType.BALANCE,
          isActive: true,
          sortOrder: 0,
        }),
        createAccountRow({
          id: "closed-wallet",
          name: "Closed wallet",
          type: AccountType.BALANCE,
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
    await waitFor(() =>
      expect(canvas.getByText("Closed wallet")).toBeVisible(),
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
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = await body.findByRole("dialog", { name: "New Account" });
    expect(
      within(dialog).queryByRole("combobox", { name: "Type" }),
    ).not.toBeInTheDocument();
    expect(
      within(canvasElement).queryByRole("tablist"),
    ).not.toBeInTheDocument();
  },
};

export const EditModalOpen: Story = {
  render: () => (
    <AccountsPageStoryHarness initialMode="active" startWithEditModal={true} />
  ),
};

export const AssetClassHelpEscapePreservesDraft: Story = {
  render: () => (
    <AccountsPageStoryHarness initialMode="active" startWithEditModal={true} />
  ),
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = await findVisibleDialog(body, "Edit Account");
    const name = within(dialog).getByRole("textbox", { name: "Name" });
    const helpButton = within(dialog).getByRole("button", {
      name: "Show Asset Class Help",
    });
    const draftName = "Unsaved Checking Account";

    await userEvent.clear(name);
    await userEvent.type(name, draftName);

    for (const activation of ["click", "keyboard"] as const) {
      if (activation === "click") {
        await userEvent.click(helpButton);
      } else {
        await expect(helpButton).toHaveFocus();
        await userEvent.keyboard("{Enter}");
      }

      const help = await body.findByRole("dialog", {
        name: "Show Asset Class Help",
      });
      await waitFor(() => expect(help).toHaveFocus());
      if (activation === "keyboard") {
        // Also cover Escape when focus is still on the popover trigger.
        helpButton.focus();
      }
      await userEvent.keyboard("{Escape}");

      await waitFor(() => expect(help).not.toBeInTheDocument());
      await expect(dialog).toBeVisible();
      await expect(name).toHaveValue(draftName);
      await waitFor(() => expect(helpButton).toHaveFocus());
    }

    for (const dismissTarget of [helpButton, name]) {
      await userEvent.click(helpButton);
      const help = await body.findByRole("dialog", {
        name: "Show Asset Class Help",
      });
      await waitFor(() => expect(help).toHaveFocus());
      await userEvent.click(dismissTarget);
      await waitFor(() => expect(help).not.toBeInTheDocument());
      await expect(dialog).toBeVisible();
      await expect(name).toHaveValue(draftName);
    }

    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
  },
};

export const RouteSmoke: Story = {
  parameters: {
    router: {
      initialPath: "/storybook-book/accounts?tab=BALANCE&mode=active",
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
    expect(canvas.queryByRole("tablist")).not.toBeInTheDocument();
    await expect(canvas.getByTestId("router-search")).toHaveTextContent(
      '"tab":"BALANCE"',
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
    await within(canvas.getByRole("treegrid")).findByText("Assets", {
      exact: true,
    });
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
      name: "Show Gain/Loss Details",
    });
    expect(button).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    const details = await within(canvasElement.ownerDocument.body).findByRole(
      "dialog",
      { name: "Gain/Loss Details" },
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
    const details = await findVisibleDialog(body, "Gain/Loss Details");
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
    expect(body.getByRole("dialog", { name: "Gain/Loss Details" })).toBe(
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
      canvas.getByRole("button", { name: "Show Gain/Loss Details" }),
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

export const SignedLiabilityBalances: Story = {
  render: () => (
    <AccountsPageStoryHarness
      initialMode="active"
      initialTab="BALANCE"
      expandGroups
      rowsOverride={[
        {
          ...createGroupRow({
            id: "cards",
            name: "Credit Cards",
            type: AccountType.BALANCE,
            isActive: true,
            sortOrder: 0,
          }),
          // Group balances are computed by the controller before rendering.
          balanceInReferenceCurrency: -75,
        },
        createAccountRow({
          id: "card-debt",
          name: "Outstanding Debt",
          groupId: "cards",
          type: AccountType.BALANCE,
          isActive: true,
          sortOrder: 0,
          currency: "CHF",
          balance: -100,
          balanceInReferenceCurrency: -100,
        }),
        createAccountRow({
          id: "card-credit",
          name: "Overpaid Card",
          groupId: "cards",
          type: AccountType.BALANCE,
          isActive: true,
          sortOrder: 1,
          currency: "CHF",
          balance: 25,
          balanceInReferenceCurrency: 25,
        }),
      ]}
    />
  ),
  play: async ({ canvasElement }) => {
    await waitFor(() =>
      expect(
        canvasElement.querySelector(
          '[row-id="card-debt"] [col-id="balanceInReferenceCurrency"]',
        ),
      ).toHaveTextContent("-100.00"),
    );
    await expect(
      canvasElement.querySelector(
        '[row-id="card-credit"] [col-id="balanceInReferenceCurrency"]',
      ),
    ).toHaveTextContent("25.00");
    await expect(
      canvasElement.querySelector(
        '[row-id="cards"] [col-id="balanceInReferenceCurrency"]',
      ),
    ).toHaveTextContent("-75.00");
    await expect(
      canvasElement.querySelector(
        '.ag-row-pinned [col-id="balanceInReferenceCurrency"]',
      ),
    ).toHaveTextContent("-75.00");
  },
};

export const LocalizedLiabilityGainLoss: Story = {
  render: () => (
    <UserLocaleProvider locale="de-CH">
      <AccountsPageStoryHarness initialMode="active" initialTab="BALANCE" />
    </UserLocaleProvider>
  ),
  play: async ({ canvasElement }) => {
    const details = await openGainLossDetails(canvasElement);
    expect(details).toHaveTextContent("Since 1.1.2026 · As of 31.3.2026");
    await userEvent.keyboard("{Escape}");
  },
};

export const ExpenseCategories: Story = {
  parameters: {
    router: {
      initialPath:
        "/storybook-book/settings/categories?tab=EQUITY-EXPENSE&showArchived=false",
    },
  },
  render: () => (
    <AccountsPageStoryHarness
      initialMode="active"
      initialTab="EQUITY-EXPENSE"
      expandGroups
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      within(canvas.getByRole("tablist", { name: "Category Type" })).getByRole(
        "tab",
        { name: "Expenses" },
      ),
    ).toHaveAttribute("aria-selected", "true");
    await expect(
      canvas.getByText("Electricity", { exact: true }),
    ).toBeVisible();
    // Name scrolls while row actions remain pinned, including on mobile.
    await expect(
      canvasElement.querySelector(
        '.ag-grid-scrolling-cells [col-id="ag-Grid-AutoColumn"]',
      ),
    ).toBeVisible();
    await expect(
      canvasElement.querySelector(
        '.ag-grid-pinned-right-cells [col-id="actions"]',
      ),
    ).toBeVisible();
    const body = within(canvasElement.ownerDocument.body);
    for (const [name, reason] of [
      ["Electricity", "Cannot delete category because it has bookings"],
      [
        "Housing",
        "Cannot delete category group because it contains categories",
      ],
    ]) {
      const row = canvas
        .getByText(name, { exact: true })
        .closest<HTMLElement>(".ag-row");
      if (!row) throw new Error(`Missing ${name} row`);
      const deleteButton = within(row).getByRole("button", { name: "Delete" });
      await expect(deleteButton).toBeDisabled();
      const trigger = deleteButton.parentElement!;
      trigger.scrollIntoView({ block: "nearest", inline: "nearest" });
      await userEvent.hover(trigger);
      await waitFor(() =>
        expect(body.getByRole("tooltip")).toHaveTextContent(reason),
      );
      await userEvent.unhover(trigger);
      await waitFor(() =>
        expect(body.queryByRole("tooltip")).not.toBeInTheDocument(),
      );
    }
    await userEvent.click(
      canvas.getByRole("button", { name: "Add Expense Category" }),
    );
    await findVisibleDialog(
      within(canvasElement.ownerDocument.body),
      "New Category",
    );
  },
};

export const CategoriesWithArchived: Story = {
  parameters: {
    router: {
      initialPath:
        "/storybook-book/settings/categories?tab=EQUITY-EXPENSE&showArchived=true",
    },
  },
  render: () => (
    <AccountsPageStoryHarness
      initialMode="active"
      initialTab="EQUITY-EXPENSE"
      expandGroups
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const visibility = canvas.getByRole("checkbox", { name: "Show Archived" });
    await expect(visibility).toBeChecked();
    for (const label of await canvas.findAllByText("Archived", {
      exact: true,
    })) {
      expect(label.closest('[role="row"]')).toHaveAttribute(
        "aria-expanded",
        "false",
      );
    }
    await expect(
      canvas.getByRole("button", { name: "Add Expense Category" }),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("navigation", { name: "Category Archive" }),
    ).not.toBeInTheDocument();
    await userEvent.hover(canvas.getAllByText("Archived", { exact: true })[0]);
    await expect(
      await within(canvasElement.ownerDocument.body).findByRole("tooltip"),
    ).toHaveTextContent(
      "Archived categories grouped automatically. Their transaction history is preserved.",
    );
    await userEvent.click(visibility);
    await waitFor(() =>
      expect(canvas.queryAllByText("Archived", { exact: true })).toHaveLength(
        0,
      ),
    );
    await expect(visibility).not.toBeChecked();
  },
};

export const CategoriesMobile: Story = {
  ...ExpenseCategories,
  parameters: {
    ...ExpenseCategories.parameters,
    viewport: { defaultViewport: "cashfolioMobile" },
  },
};

export const IncomeCategories: Story = {
  parameters: {
    router: {
      initialPath:
        "/storybook-book/settings/categories?tab=EQUITY-INCOME&showArchived=false",
    },
  },
  render: () => (
    <AccountsPageStoryHarness initialMode="active" initialTab="EQUITY-INCOME" />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      within(
        canvas.getByRole("tablist", { name: "Account Book Settings" }),
      ).getByRole("tab", { name: "Categories" }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(
      within(canvas.getByRole("tablist", { name: "Category Type" })).getByRole(
        "tab",
        { name: "Income" },
      ),
    ).toHaveAttribute("aria-selected", "true");
    await userEvent.click(
      canvas.getByRole("button", { name: "Add Income Category" }),
    );
    await findVisibleDialog(
      within(canvasElement.ownerDocument.body),
      "New Category",
    );
  },
};

export const CategoriesWithArchivedMobile: Story = {
  ...CategoriesWithArchived,
  parameters: {
    ...CategoriesWithArchived.parameters,
    viewport: { defaultViewport: "cashfolioMobile" },
  },
};

export const MixedBalanceHierarchy: Story = {
  render: () => (
    <AccountsPageStoryHarness
      initialMode="active"
      expandGroups
      rowsOverride={[
        {
          ...createGroupRow({
            id: "banking",
            name: "Banking",
            type: AccountType.BALANCE,
            isActive: true,
            sortOrder: 0,
          }),
          balanceInReferenceCurrency: 40,
        },
        createAccountRow({
          id: "bank",
          name: "Bank Balance",
          groupId: "banking",
          type: AccountType.BALANCE,
          isActive: true,
          sortOrder: 0,
          currency: "CHF",
          balance: 100,
          balanceInReferenceCurrency: 100,
        }),
        createAccountRow({
          id: "credit",
          name: "Credit Balance",
          groupId: "banking",
          type: AccountType.BALANCE,
          isActive: true,
          sortOrder: 1,
          currency: "CHF",
          balance: -60,
          balanceInReferenceCurrency: -60,
        }),
      ]}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.queryByRole("tablist")).not.toBeInTheDocument();
    await expect(
      canvas.findByText("Bank Balance", { exact: true }),
    ).resolves.toBeVisible();
    await expect(
      canvas.findByText("Credit Balance", { exact: true }),
    ).resolves.toBeVisible();
    expect(
      canvasElement.querySelector(
        '[row-id="banking"] [col-id="balanceInReferenceCurrency"]',
      ),
    ).toHaveTextContent("40.00");
  },
};

const bulkRows: TreeRow[] = [
  createGroupRow({
    id: "portfolio",
    name: "Portfolio",
    type: AccountType.BALANCE,
    isActive: true,
    sortOrder: 0,
  }),
  createGroupRow({
    id: "nested",
    name: "Nested",
    parentId: "portfolio",
    type: AccountType.BALANCE,
    isActive: true,
    sortOrder: 0,
  }),
  createGroupRow({
    id: "empty",
    name: "Empty",
    type: AccountType.BALANCE,
    isActive: true,
    sortOrder: 1,
  }),
  {
    ...activeAssetRows.find((row) => row.id === "account-checking")!,
    groupId: "portfolio",
    parentId: "portfolio",
    assetClass: "FIXED_INCOME",
  },
  {
    ...activeAssetRows.find((row) => row.nodeType === "account")!,
    id: "old",
    name: "Old Holding",
    groupId: "nested",
    parentId: "nested",
    isActive: false,
    assetClass: "DIGITAL_ASSETS",
  },
];

async function selectAssignmentAccount(canvasElement: HTMLElement, id: string) {
  const selector = `.ag-row[row-id="${id}"] .ag-selection-checkbox input`;
  await waitFor(() =>
    expect(canvasElement.querySelector(selector)).not.toBeNull(),
  );
  await userEvent.click(canvasElement.querySelector(selector)!);
}

export const BulkAssetClassSelection: Story = {
  render: () => (
    <AccountsPageStoryHarness
      initialMode="active"
      bulkAssignment
      expandGroups
      rowsOverride={bulkRows}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await selectAssignmentAccount(canvasElement, "account-checking");
    await expect(await canvas.findByRole("status")).toHaveTextContent(
      "1 account selected",
    );
    const toolbar = within(
      canvas.getByRole("toolbar", { name: "Selected Account Actions" }),
    );
    await expect(
      toolbar.getByRole("button", { name: "Set Asset Class" }),
    ).toBeVisible();
    await expect(
      toolbar.getByRole("button", { name: "Clear Selection" }),
    ).toBeVisible();
    await expect(
      toolbar.queryByRole("button", {
        name: "Move Accounts to Group",
      }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole("button", { name: "Set Asset Class" }),
    );
    const dialog = within(await findVisibleDialog(body, "Set Asset Class"));
    await expect(dialog.getByRole("button", { name: "Apply" })).toBeDisabled();
    await expect(dialog.getByText(/1 account \(0 archived\)/)).toBeVisible();
    await userEvent.click(dialog.getByLabelText("Asset Class"));
    await userEvent.click(body.getByRole("option", { name: "Equities" }));
    await userEvent.click(dialog.getByRole("button", { name: "Apply" }));
    await waitFor(() =>
      expect(
        body.queryByRole("dialog", { name: "Set Asset Class" }),
      ).not.toBeInTheDocument(),
    );
    await expect(
      canvas.queryByRole("toolbar", { name: "Selected Account Actions" }),
    ).not.toBeInTheDocument();
    await expect(canvas.getByTestId("assignment-refreshes")).toHaveTextContent(
      "invalidations: 1",
    );
    await expect(
      canvasElement.querySelector(
        '[row-id="account-checking"] [col-id="assetClass"]',
      ),
    ).toHaveTextContent("Equities");
  },
};

export const BulkAssetClassFilteredSelection: Story = {
  render: () => (
    <AccountsPageStoryHarness
      initialMode="active"
      bulkAssignment
      expandGroups
      rowsOverride={bulkRows}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() =>
      expect(
        canvasElement.querySelector(".ag-header-select-all input"),
      ).not.toBeNull(),
    );
    await userEvent.click(
      canvasElement.querySelector(".ag-header-select-all input")!,
    );
    await expect(await canvas.findByRole("status")).toHaveTextContent(
      "2 accounts selected",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Filter to Checking" }),
    );
    await waitFor(() =>
      expect(canvas.getByRole("status")).toHaveTextContent(
        "1 account selected",
      ),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Clear Selection" }),
    );
    await userEvent.click(
      canvasElement.querySelector(".ag-header-select-all input")!,
    );
    await expect(await canvas.findByRole("status")).toHaveTextContent(
      "1 account selected",
    );
  },
};

export const GroupAssetClassRetry: Story = {
  render: () => (
    <AccountsPageStoryHarness
      initialMode="active"
      bulkAssignment
      assignmentFailsOnce
      rowsOverride={bulkRows}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await selectAssignmentAccount(canvasElement, "portfolio");
    await userEvent.click(
      canvas.getByRole("button", { name: "Set Asset Class" }),
    );
    const dialog = within(await findVisibleDialog(body, "Set Asset Class"));
    await expect(dialog.getByText(/2 accounts \(1 archived\)/)).toBeVisible();
    await userEvent.click(dialog.getByLabelText("Asset Class"));
    await userEvent.click(body.getByRole("option", { name: "Unclassified" }));
    await userEvent.click(dialog.getByRole("button", { name: "Apply" }));
    await expect(await dialog.findByRole("alert")).toHaveTextContent(
      ACCOUNT_BOOK_BUSY_MESSAGE,
    );
    await expect(dialog.getByLabelText("Asset Class")).toHaveValue(
      "Unclassified",
    );
    await expect(canvas.getByTestId("assignment-refreshes")).toHaveTextContent(
      "Refreshes: 1; invalidations: 0",
    );
    await userEvent.click(dialog.getByRole("button", { name: "Try Again" }));
    await waitFor(() =>
      expect(
        body.queryByRole("dialog", { name: "Set Asset Class" }),
      ).not.toBeInTheDocument(),
    );
    await expect(canvas.getByTestId("assignment-refreshes")).toHaveTextContent(
      "invalidations: 1",
    );
  },
};

export const BulkAssetClassScopeReset: Story = {
  render: () => (
    <AccountsPageStoryHarness
      initialMode="active"
      bulkAssignment
      expandGroups
      rowsOverride={bulkRows}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await selectAssignmentAccount(canvasElement, "account-checking");
    await expect(await canvas.findByRole("status")).toHaveTextContent(
      "1 account selected",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Change Account Book" }),
    );
    await waitFor(() =>
      expect(
        canvas.queryByRole("toolbar", { name: "Selected Account Actions" }),
      ).not.toBeInTheDocument(),
    );
    await expect(
      canvasElement.querySelector(
        '[row-id="account-checking"] .ag-selection-checkbox input',
      ),
    ).not.toBeChecked();
  },
};

const groupSelectionRows: TreeRow[] = [
  ...bulkRows,
  createGroupRow({
    id: "other-group",
    name: "Other Group",
    type: AccountType.BALANCE,
    isActive: true,
    sortOrder: 2,
  }),
  {
    ...bulkRows[3],
    id: "other",
    name: "Other Account",
    groupId: "other-group",
    parentId: "other-group",
  },
  createGroupRow({
    id: "closed",
    name: "Closed Group",
    type: AccountType.BALANCE,
    isActive: false,
    sortOrder: 3,
  }),
  {
    ...bulkRows[4],
    id: "closed-child",
    name: "Closed Account",
    groupId: "closed",
    parentId: "closed",
  },
];

function assignmentCheckbox(canvasElement: HTMLElement, id: string) {
  return canvasElement.querySelector<HTMLInputElement>(
    `.ag-row[row-id="${id}"] .ag-selection-checkbox input`,
  );
}

async function expandAssignmentGroup(canvasElement: HTMLElement, id: string) {
  const selector = `.ag-row[row-id="${id}"] .ag-group-contracted`;
  await waitFor(() =>
    expect(canvasElement.querySelector(selector)).not.toBeNull(),
  );
  await userEvent.click(canvasElement.querySelector(selector)!);
}

export const BulkGroupCheckboxSelection: Story = {
  render: () => (
    <AccountsPageStoryHarness
      initialMode="active"
      bulkAssignment
      rowsOverride={groupSelectionRows}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await waitFor(() =>
      expect(assignmentCheckbox(canvasElement, "empty")).toBeDisabled(),
    );
    await userEvent.click(canvas.getByText("Portfolio", { exact: true }));
    await expect(
      canvas.queryByRole("toolbar", { name: "Selected Account Actions" }),
    ).not.toBeInTheDocument();
    await selectAssignmentAccount(canvasElement, "portfolio");
    await expect(await canvas.findByRole("status")).toHaveTextContent(
      "2 accounts selected",
    );
    await expect(assignmentCheckbox(canvasElement, "portfolio")).toBeChecked();
    await expect(canvasElement.querySelector('[row-id="old"]')).toBeNull();
    await expandAssignmentGroup(canvasElement, "portfolio");
    await selectAssignmentAccount(canvasElement, "nested");
    await expect(canvas.getByRole("status")).toHaveTextContent(
      "1 account selected",
    );
    await waitFor(() =>
      expect(
        assignmentCheckbox(canvasElement, "portfolio")?.indeterminate,
      ).toBe(true),
    );
    await selectAssignmentAccount(canvasElement, "account-checking");
    await expect(
      canvas.queryByRole("toolbar", { name: "Selected Account Actions" }),
    ).not.toBeInTheDocument();
    await selectAssignmentAccount(canvasElement, "portfolio");
    await selectAssignmentAccount(canvasElement, "other-group");
    await expect(canvas.getByRole("status")).toHaveTextContent(
      "3 accounts selected",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Set Asset Class" }),
    );
    const dialog = within(await findVisibleDialog(body, "Set Asset Class"));
    await expect(dialog.getByText(/3 accounts \(1 archived\)/)).toBeVisible();
    await userEvent.click(dialog.getByLabelText("Asset Class"));
    await userEvent.click(body.getByRole("option", { name: "Equities" }));
    await userEvent.click(dialog.getByRole("button", { name: "Apply" }));
    await waitFor(() =>
      expect(canvas.getByTestId("assignment-account-ids")).toHaveTextContent(
        "account-checking,old,other",
      ),
    );
    await expect(
      canvas.queryByRole("toolbar", { name: "Selected Account Actions" }),
    ).not.toBeInTheDocument();
  },
};

export const BulkArchivedCheckboxSelection: Story = {
  render: () => (
    <AccountsPageStoryHarness
      initialMode="active"
      bulkAssignment
      rowsOverride={groupSelectionRows}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await selectAssignmentAccount(canvasElement, "__archived__:root");
    await expect(await canvas.findByRole("status")).toHaveTextContent(
      "1 account selected",
    );
    await expect(
      canvasElement.querySelector('[row-id="closed-child"]'),
    ).toBeNull();
    await selectAssignmentAccount(canvasElement, "__archived__:root");
    await expect(
      canvas.queryByRole("toolbar", { name: "Selected Account Actions" }),
    ).not.toBeInTheDocument();
    await expandAssignmentGroup(canvasElement, "__archived__:root");
    await selectAssignmentAccount(canvasElement, "closed");
    await expect(await canvas.findByRole("status")).toHaveTextContent(
      "1 account selected",
    );
    await expect(
      assignmentCheckbox(canvasElement, "__archived__:root"),
    ).toBeChecked();
    await userEvent.click(
      canvas.getByRole("button", { name: "Clear Selection" }),
    );
    await expandAssignmentGroup(canvasElement, "portfolio");
    await expandAssignmentGroup(canvasElement, "nested");
    await selectAssignmentAccount(canvasElement, "__archived__:group:nested");
    await expect(await canvas.findByRole("status")).toHaveTextContent(
      "1 account selected",
    );
    await waitFor(() =>
      expect(
        assignmentCheckbox(canvasElement, "portfolio")?.indeterminate,
      ).toBe(true),
    );
  },
};

export const BulkFilteredGroupCheckboxSelection: Story = {
  render: () => (
    <AccountsPageStoryHarness
      initialMode="active"
      bulkAssignment
      expandGroups
      rowsOverride={bulkRows}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      canvas.getByRole("button", { name: "Filter to Checking" }),
    );
    await waitFor(() =>
      expect(canvasElement.querySelector('[row-id="old"]')).toBeNull(),
    );
    await selectAssignmentAccount(canvasElement, "portfolio");
    await expect(await canvas.findByRole("status")).toHaveTextContent(
      "1 account selected",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Clear Account Filters" }),
    );
    await waitFor(() =>
      expect(assignmentCheckbox(canvasElement, "old")).not.toBeNull(),
    );
    await expect(assignmentCheckbox(canvasElement, "old")).not.toBeChecked();
    await waitFor(() =>
      expect(
        assignmentCheckbox(canvasElement, "portfolio")?.indeterminate,
      ).toBe(true),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Set Asset Class" }),
    );
    const dialog = within(await findVisibleDialog(body, "Set Asset Class"));
    await expect(dialog.getByText(/1 account \(0 archived\)/)).toBeVisible();
    await userEvent.click(dialog.getByLabelText("Asset Class"));
    await userEvent.click(body.getByRole("option", { name: "Equities" }));
    await userEvent.click(dialog.getByRole("button", { name: "Apply" }));
    await waitFor(() =>
      expect(canvas.getByTestId("assignment-account-ids")).toHaveTextContent(
        "account-checking",
      ),
    );
    await expect(
      canvasElement.querySelector('[row-id="old"] [col-id="assetClass"]'),
    ).toHaveTextContent("Digital Assets");
  },
};
