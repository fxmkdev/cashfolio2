import { getManagementTabs } from "@/shared/account-tabs";
import type { OrganizerApi } from "@/components/hierarchy-organize/use-organizer";
import { getAccountsModalViewProps } from "./page-modal-props";
import { createHierarchyEditorActions } from "./hierarchy-editor-actions";
import type { AccountsControllerOptions } from "./page-controller-types";
import type { AccountsControllerModel } from "./use-accounts-controller-model";
import type { useAccountsControllerGrid } from "./use-accounts-controller-grid";
import type { useAccountsManagement } from "./use-accounts-management";
import type { AccountsPageViewProps } from "./page-view-types";
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
  const { data, modalState, presentation } = model;
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
