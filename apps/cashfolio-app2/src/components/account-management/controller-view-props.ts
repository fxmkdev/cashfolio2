import { getManagementTabs } from "@/shared/accounts/account-tabs";
import type { OrganizerApi } from "@/components/hierarchy-organize/use-organizer";
import { getAccountsModalViewProps } from "./dialogs/props";
import { createHierarchyEditorActions } from "./management/hierarchy-editor-actions";
import type { AccountsControllerOptions } from "./controller-types";
import type { AccountsControllerModel } from "./use-controller-model";
import type { useAccountsControllerGrid } from "./grid/use-controller-grid";
import type { useAccountsManagement } from "./management/use-management";
import type { AccountsPageViewProps } from "./view-types";
type ViewOptions = {
  options: AccountsControllerOptions;
  model: AccountsControllerModel;
  management: ReturnType<typeof useAccountsManagement>;
  grid: ReturnType<typeof useAccountsControllerGrid>;
  organizerApi: OrganizerApi;
};

export function getAccountsControllerViewProps({
  options,
  model,
  management,
  grid,
  organizerApi,
}: ViewOptions): AccountsPageViewProps {
  const { data, modalState, presentation, returns } = model;
  const {
    accountGroups,
    archivedAccountGroups,
    archivedExistingNodes,
    existingNodes,
    unitUsage,
  } = data.loaderData;
  return {
    ...createHierarchyEditorActions(
      presentation.rows,
      modalState.handleEditRow,
      management.onAddChild,
    ),
    onOrganizeSaved: options.invalidate,
    organize: options.organize,
    organizerApi,
    bulkAccountActions: !data.isEquityTab
      ? management.bulkAccountActions
      : undefined,
    managementContext: options.managementContext ?? "accounts",
    gainLoss: { ...data.gainLoss, data: presentation.gainLossData },
    returns,
    returnCalculation: {
      target: returns.target,
      onClose: returns.onClose,
      refreshKey: data.loaderData,
    },
    grouping: options.grouping,
    onGroupingChange: options.onGroupingChange,
    onRefreshConstraints: data.onRefreshConstraints,
    unarchiveRecovery: management.unarchiveRecovery,
    accountBookId: options.accountBookId,
    tab: options.tab,
    mode: options.mode,
    showArchived: options.showArchived,
    onShowArchivedChange: options.onShowArchivedChange,
    tabs: getManagementTabs(options.managementContext ?? "accounts"),
    accountGroups,
    archivedAccountGroups,
    archivedExistingNodes,
    existingNodes,
    unitUsage,
    rows: presentation.rows,
    ...grid,
    pinnedBottomRowData: presentation.pinnedBottomRowData,
    ...getAccountsModalViewProps(modalState, management.actions),
    onOpenLedger: options.onOpenLedger,
  };
}
