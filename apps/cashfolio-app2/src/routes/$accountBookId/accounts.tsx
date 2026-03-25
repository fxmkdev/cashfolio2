import {
  createFileRoute,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useExpandedGroups } from "../../hooks/use-expanded-groups";
import type {
  AccountInitialValues,
  TransformedFormValues,
} from "../../components/edit-account-modal";
import type {
  AccountGroupInitialValues,
  AccountGroupTransformedFormValues,
} from "../../components/edit-account-group-modal";
import {
  archiveAccount,
  archiveAccountGroup,
  createAccount,
  createAccountGroup,
  deleteAccount,
  deleteAccountGroup,
  getAccountReferenceBalances,
  reorderAccountTreeItems,
  unarchiveAccount,
  unarchiveAccountGroup,
  updateAccount,
  updateAccountGroup,
} from "../../server/accounts";
import {
  REFERENCE_CURRENCY_TOTAL_FOOTER_ROW_ID,
  getTabDefinition,
  type ReferenceCurrencyTotalFooterRow,
  parseAccountsSearch,
  tabs,
  type TreeRow,
} from "./-accounts-page-types";
import { loadAccountsPageData } from "./-accounts-page-loader";
import {
  useBalanceInReferenceCurrencyByGroupId,
  useReferenceCurrencyBalanceTotal,
  useRowsByParentKey,
  useSelectedSiblingRows,
} from "./-accounts-page-data";
import { useAccountTreeColumnDefs } from "./-accounts-page-columns";
import { REFERENCE_BALANCES_LOADING_DELAY_MS } from "./reference-balance-loading";

const AccountsPageView = lazy(async () => {
  const module = await import("./-accounts-page-view");
  return { default: module.AccountsPageView };
});

export const Route = createFileRoute("/$accountBookId/accounts")({
  validateSearch: parseAccountsSearch,
  loaderDeps: ({ search }) => ({ mode: search.mode, tab: search.tab }),
  loader: async ({ params: { accountBookId }, deps: { mode, tab } }) => {
    return loadAccountsPageData({ accountBookId, mode, tab });
  },
  component: AccountsPage,
});

function AccountsPage() {
  const {
    accountGroups,
    rows: loaderRows,
    existingNodes,
    referenceCurrency,
  } = Route.useLoaderData();
  const { accountBookId } = Route.useParams();
  const { tab, mode } = Route.useSearch();
  const navigate = useNavigate({ from: "/$accountBookId/accounts" });
  const router = useRouter();
  const [referenceBalanceByRowId, setReferenceBalanceByRowId] = useState(
    () => new Map<string, number | null>(),
  );
  const [isReferenceBalancesLoading, setIsReferenceBalancesLoading] =
    useState(false);
  const [showReferenceBalancesLoading, setShowReferenceBalancesLoading] =
    useState(false);
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
  const loaderRowsStateKey = useMemo(
    () =>
      loaderRows
        .map(
          (row) =>
            `${row.id}|${row.name}|${row.parentId ?? ""}|${row.sortOrder ?? ""}|${
              row.balanceInReferenceCurrency ?? ""
            }`,
        )
        .join("::"),
    [loaderRows],
  );

  const rows = useMemo(
    () =>
      loaderRows.map((row) => {
        if (!referenceBalanceByRowId.has(row.id)) {
          return row;
        }
        const referenceBalance = referenceBalanceByRowId.get(row.id) ?? null;
        if (referenceBalance === row.balanceInReferenceCurrency) {
          return row;
        }
        return {
          ...row,
          balanceInReferenceCurrency: referenceBalance,
        };
      }),
    [loaderRows, referenceBalanceByRowId],
  );

  useEffect(() => {
    setReferenceBalanceByRowId(new Map());
  }, [accountBookId, loaderRowsStateKey, mode, tab]);

  useEffect(() => {
    if (isEquityTab) {
      setIsReferenceBalancesLoading(false);
      return;
    }

    const tabDefinition = getTabDefinition(tab);
    let active = true;
    setIsReferenceBalancesLoading(true);
    void getAccountReferenceBalances({
      data: {
        accountBookId,
        accountState: isArchivedMode ? "inactive" : "active",
        type: tabDefinition.type,
        ...("equityAccountSubtype" in tabDefinition
          ? { equityAccountSubtype: tabDefinition.equityAccountSubtype }
          : undefined),
      },
    })
      .then((referenceBalanceData) => {
        if (!active) return;
        setReferenceBalanceByRowId(
          new Map(
            referenceBalanceData.rows.map((row) => [
              row.id,
              row.balanceInReferenceCurrency,
            ]),
          ),
        );
      })
      .catch((error) => {
        console.error(
          "Unable to load reference-currency balances for accounts tab",
          error,
        );
      })
      .finally(() => {
        if (!active) return;
        setIsReferenceBalancesLoading(false);
      });

    return () => {
      active = false;
    };
  }, [accountBookId, isArchivedMode, isEquityTab, loaderRowsStateKey, tab]);

  useEffect(() => {
    if (!isReferenceBalancesLoading) {
      setShowReferenceBalancesLoading(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setShowReferenceBalancesLoading(true);
    }, REFERENCE_BALANCES_LOADING_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isReferenceBalancesLoading]);

  const storageKey = `cashfolio:expandedGroups:${accountBookId}:${mode}:${tab}`;
  const { isGroupOpenByDefault, onRowGroupOpened } =
    useExpandedGroups(storageKey);

  const rowsByParentKey = useRowsByParentKey(rows);
  const selectedSiblingRows = useSelectedSiblingRows(
    rowsByParentKey,
    reorderingRow,
  );
  const balanceInReferenceCurrencyByGroupId =
    useBalanceInReferenceCurrencyByGroupId(rowsByParentKey, rows, !isEquityTab);
  const referenceCurrencyBalanceTotal = useReferenceCurrencyBalanceTotal(
    rows,
    !isEquityTab,
  );
  const pinnedBottomRowData: ReferenceCurrencyTotalFooterRow[] | undefined =
    isEquityTab
      ? undefined
      : [
          {
            id: REFERENCE_CURRENCY_TOTAL_FOOTER_ROW_ID,
            rowType: "referenceCurrencyTotalFooter",
            name: "Total",
            balanceInReferenceCurrency: referenceCurrencyBalanceTotal,
          },
        ];

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
    isReferenceBalancesLoading:
      isReferenceBalancesLoading && showReferenceBalancesLoading,
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
    <Suspense fallback={null}>
      <AccountsPageView
        accountBookId={accountBookId}
        tab={tab}
        mode={mode}
        tabs={tabs}
        accountGroups={accountGroups}
        existingNodes={existingNodes}
        rows={rows}
        columnDefs={columnDefs}
        pinnedBottomRowData={pinnedBottomRowData}
        isGroupOpenByDefault={isGroupOpenByDefault}
        onRowGroupOpened={onRowGroupOpened}
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
        onOpenLedger={(nextAccountId) =>
          navigate({
            to: "/$accountBookId/$accountId",
            params: { accountBookId, accountId: nextAccountId },
          })
        }
        onCloseCreateAccount={() => setCreateModalOpened(false)}
        onSubmitCreateAccount={handleCreateAccount}
        onCloseEditAccount={() => setEditModalOpen(false)}
        onClearEditingAccount={() => setEditingAccount(undefined)}
        onSubmitUpdateAccount={handleUpdateAccount}
        onCloseCreateGroup={() => setCreateGroupModalOpened(false)}
        onSubmitCreateGroup={handleCreateGroup}
        onCloseEditGroup={() => setEditGroupModalOpen(false)}
        onClearEditingGroup={() => setEditingGroup(undefined)}
        onSubmitUpdateGroup={handleUpdateGroup}
        onCloseDelete={() => setDeletingRow(undefined)}
        onConfirmDelete={handleDelete}
        onCloseArchive={() => setArchivingRow(undefined)}
        onConfirmArchive={handleArchive}
        onCloseReorder={() => setReorderingRow(undefined)}
        onReorderSiblings={handleReorderSiblings}
      />
    </Suspense>
  );
}
