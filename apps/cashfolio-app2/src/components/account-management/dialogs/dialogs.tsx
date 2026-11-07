import { AssetClassAssignmentDialog } from "../assignments/asset-class";
import { TrackingMethodAssignmentDialog } from "../assignments/tracking-method";
import {
  CreateAccountDialog,
  CreateGroupDialog,
  EditAccountDialog,
  EditGroupDialog,
} from "./editors";
import { ArchiveConfirmation, DeleteConfirmation } from "./confirmations";
import type { AccountsPageViewProps } from "../view-types";
export function AccountsBulkAssignmentDialogs({
  bulkAccountActions,
}: Pick<AccountsPageViewProps, "bulkAccountActions">) {
  return (
    <>
      {bulkAccountActions?.assetClassTarget && (
        <AssetClassAssignmentDialog
          target={bulkAccountActions.assetClassTarget}
          onClose={bulkAccountActions.close}
          onSubmit={bulkAccountActions.applyAssetClass}
          onRefreshConstraints={bulkAccountActions.onRefreshConstraints}
        />
      )}
      {bulkAccountActions?.trackingMethodTarget && (
        <TrackingMethodAssignmentDialog
          target={bulkAccountActions.trackingMethodTarget}
          onClose={bulkAccountActions.close}
          onSubmit={bulkAccountActions.applyTrackingMethod}
          onRefreshConstraints={bulkAccountActions.onRefreshConstraints}
        />
      )}
    </>
  );
}

type AccountsPageDialogProps = Pick<
  AccountsPageViewProps,
  | "managementContext"
  | "editorSubmitState"
  | "rows"
  | "editingAccount"
  | "editingGroup"
  | "accountGroups"
  | "archivedAccountGroups"
  | "existingNodes"
  | "archivedExistingNodes"
  | "unitUsage"
  | "tab"
  | "onRefreshConstraints"
  | "createAccountGroupId"
  | "createGroupParentId"
  | "createModalOpened"
  | "createGroupModalOpened"
  | "editModalOpen"
  | "editGroupModalOpen"
  | "archivingRow"
  | "deletingRow"
  | "onCloseCreateAccount"
  | "onSubmitCreateAccount"
  | "onCloseCreateGroup"
  | "onSubmitCreateGroup"
  | "onCloseEditAccount"
  | "onClearEditingAccount"
  | "onSubmitUpdateAccount"
  | "onCloseEditGroup"
  | "onClearEditingGroup"
  | "onSubmitUpdateGroup"
  | "onCloseArchive"
  | "onConfirmArchive"
  | "onCloseDelete"
  | "onConfirmDelete"
>;

export function AccountsPageDialogs(props: AccountsPageDialogProps) {
  return (
    <>
      <>
        <CreateAccountDialog {...props} />
        <ArchiveConfirmation {...props} />
      </>
      <CreateGroupDialog {...props} />
      <EditAccountDialog {...props} />
      <EditGroupDialog {...props} />
      <DeleteConfirmation {...props} />
    </>
  );
}
