import { getAccountsModalViewProps } from "./-page-modal-props";
import { getManagementTabs } from "./-page-types";
import { useSelectedSiblingRows } from "./-page-data";
import { useAccountsPageModalState } from "./-page-modal-state";
import { useAccountTreeColumnDefs } from "./-page-columns";
import { loadAccountsPageData } from "./-page-loader";
import type { AccountsPageViewProps } from "./-page-view";
import { type AccountManagementContext } from "@/shared/account-presentation";
import { useAccountsPageData } from "./-use-accounts-page-data";
import { useAccountsPresentation } from "./-use-accounts-presentation";
import { useAccountsGrid } from "./-use-accounts-grid";
import { useAccountsManagement } from "./-use-accounts-management";
type AccountsPageLoaderData = Awaited<ReturnType<typeof loadAccountsPageData>>;
type AccountsPageControllerViewProps = AccountsPageViewProps;
export function useAccountsPageController(args: {
  managementContext?: AccountManagementContext;
  loaderData: AccountsPageLoaderData;
  accountBookId: string;
  tab: AccountsPageViewProps["tab"];
  mode?: AccountsPageViewProps["mode"];
  showArchived?: boolean;
  grouping?: AccountsPageViewProps["grouping"];
  onGroupingChange?: AccountsPageViewProps["onGroupingChange"];
  onShowArchivedChange?: AccountsPageViewProps["onShowArchivedChange"];
  invalidate: () => void;
  onOpenLedger: AccountsPageViewProps["onOpenLedger"];
}): AccountsPageControllerViewProps {
  const mode = args.mode ?? "active";
  const grouping =
    args.managementContext === "categories"
      ? "accountStructure"
      : (args.grouping ?? "accountStructure");
  const showArchived = args.showArchived ?? false;
  const {
    loaderData,
    scopeKey,
    onRefreshConstraints,
    isEquityTab,
    rowsWithAccountReferenceBalances,
    shouldShowReferenceBalancesLoading,
    gainLoss,
  } = useAccountsPageData({ ...args, mode, showArchived });
  const {
    accountGroups,
    archivedAccountGroups,
    archivedExistingNodes,
    existingNodes,
    referenceCurrency,
    unitUsage,
  } = loaderData;
  const modalState = useAccountsPageModalState(
    `${args.accountBookId}:${args.tab}`,
  );
  const {
    rows,
    rowsByParentKey,
    balanceInReferenceCurrencyByGroupId,
    gainLossData: projectedGainLoss,
    pinnedBottomRowData,
  } = useAccountsPresentation({
    sourceRows: rowsWithAccountReferenceBalances,
    grouping,
    isEquityTab,
    gainLossData: gainLoss.data,
  });
  const selectedSiblingRows = useSelectedSiblingRows(
    rowsByParentKey,
    modalState.reorderingRow,
  );
  const grid = useAccountsGrid({
    accountBookId: args.accountBookId,
    tab: args.tab,
    managementContext: args.managementContext,
    grouping,
    showArchived,
    shouldShowReferenceBalancesLoading,
  });
  const { actions, unarchiveRecovery, bulkAccountActions, onAddChild } =
    useAccountsManagement({
      accountBookId: args.accountBookId,
      managementContext: args.managementContext,
      scopeKey,
      grouping,
      isEquityTab,
      rows,
      accountGroups,
      modalState,
      invalidate: args.invalidate,
      onRefreshConstraints,
    });
  const columnDefs = useAccountTreeColumnDefs({
    gainLossData: projectedGainLoss,
    grouping,
    isGainLossLoading: gainLoss.loading,
    isEquityTab,
    categoryType: args.tab === "EQUITY-INCOME" ? "INCOME" : "EXPENSE",
    rowsByParentKey,
    referenceCurrency,
    isReferenceBalancesLoading: shouldShowReferenceBalancesLoading,
    balanceInReferenceCurrencyByGroupId,
    onEditRow: modalState.handleEditRow,
    onAddChild,
    onUnarchiveRow: unarchiveRecovery.unarchive,
    unarchivePending: unarchiveRecovery.isPending,
    onArchiveRow: modalState.setArchivingRow,
    onDeleteRow: modalState.setDeletingRow,
    onReorderRow: modalState.setReorderingRow,
  });

  return {
    bulkAccountActions: !isEquityTab ? bulkAccountActions : undefined,
    managementContext: args.managementContext ?? "accounts",
    gainLoss: { ...gainLoss, data: projectedGainLoss },
    grouping,
    onGroupingChange: args.onGroupingChange,
    onRefreshConstraints,
    unarchiveRecovery,
    accountBookId: args.accountBookId,
    tab: args.tab,
    mode,
    showArchived,
    onShowArchivedChange: args.onShowArchivedChange,
    tabs: getManagementTabs(args.managementContext ?? "accounts"),
    accountGroups,
    archivedAccountGroups,
    archivedExistingNodes,
    existingNodes,
    unitUsage,
    rows,
    columnDefs,
    onGridReady: grid.onGridReady,
    pinnedBottomRowData,
    isGroupOpenByDefault: grid.isGroupOpenByDefault,
    onRowGroupOpened: grid.onRowGroupOpened,
    selectedSiblingRows,
    ...getAccountsModalViewProps(modalState, actions),
    onOpenLedger: args.onOpenLedger,
  };
}
