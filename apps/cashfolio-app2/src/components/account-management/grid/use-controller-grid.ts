import { useAccountsGrid } from "./use-grid";
import { useAccountTreeColumnDefs } from "./columns";
import type { AccountsControllerOptions } from "../controller-types";
import type { AccountsControllerModel } from "../use-controller-model";
import type { useAccountsManagement } from "../management/use-management";
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
  const { data, modalState, presentation, returns } = model;
  const grid = useAccountsGrid({
    ...options,
    shouldShowReferenceBalancesLoading: data.shouldShowReferenceBalancesLoading,
    returnCellVersion: returns.cellVersion,
  });
  const columnDefs = useAccountTreeColumnDefs({
    filterContext: presentation.filterContext,
    returnData: returns.data,
    isReturnLoading: returns.loading,
    completedReturnIds: returns.completedIds,
    onOpenReturn: returns.onOpen,
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
    onMoveRow: data.isEquityTab ? undefined : modalState.setMovingRow,
    onEditRow: modalState.handleEditRow,
    onAddChild: management.onAddChild,
    onUnarchiveRow: management.unarchiveRecovery.unarchive,
    unarchivePending: management.unarchiveRecovery.isPending,
    onArchiveRow: modalState.setArchivingRow,
    onDeleteRow: modalState.setDeletingRow,
  });
  return { ...grid, columnDefs };
}
