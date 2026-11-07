import { useAccountsGrid } from "./use-accounts-grid";
import { useAccountTreeColumnDefs } from "./page-columns";
import type { AccountsControllerOptions } from "./page-controller-types";
import type { AccountsControllerModel } from "./use-accounts-controller-model";
import type { useAccountsManagement } from "./use-accounts-management";
type GridOptions = {
  options: AccountsControllerOptions;
  model: AccountsControllerModel;
  management: ReturnType<typeof useAccountsManagement>;
};

export function useAccountsControllerGrid({
  options,
  model,
  management,
}: GridOptions) {
  const { data, modalState, presentation } = model;
  const grid = useAccountsGrid({
    ...options,
    shouldShowReferenceBalancesLoading: data.shouldShowReferenceBalancesLoading,
  });
  const columnDefs = useAccountTreeColumnDefs({
    gainLossData: presentation.gainLossData,
    grouping: options.grouping,
    isGainLossLoading: data.gainLoss.loading,
    isEquityTab: data.isEquityTab,
    categoryType: options.tab === "EQUITY-INCOME" ? "INCOME" : "EXPENSE",
    rowsByParentKey: presentation.rowsByParentKey,
    referenceCurrency: data.loaderData.referenceCurrency,
    isReferenceBalancesLoading: data.shouldShowReferenceBalancesLoading,
    balanceInReferenceCurrencyByGroupId:
      presentation.balanceInReferenceCurrencyByGroupId,
    onEditRow: modalState.handleEditRow,
    onAddChild: management.onAddChild,
    onUnarchiveRow: management.unarchiveRecovery.unarchive,
    unarchivePending: management.unarchiveRecovery.isPending,
    onArchiveRow: modalState.setArchivingRow,
    onDeleteRow: modalState.setDeletingRow,
  });
  return { ...grid, columnDefs };
}
