import { AssetClassAssignmentDialog } from "./-asset-class-assignment";
import { TrackingMethodAssignmentDialog } from "./-tracking-method-assignment";
import { getAccountConstraintMessage } from "@/shared/account-presentation";
import { EditAccountGroupModal } from "@/components/account-editor/edit-account-group-modal";
import { EditAccountModal } from "@/components/account-editor/edit-account-modal";
import { ConfirmArchiveModal } from "@/components/dialogs/confirm-archive-modal";
import { ConfirmDeleteModal } from "@/components/dialogs/confirm-delete-modal";
import { ReorderGroupChildrenModal } from "@/components/account-tree/reorder-group-children-modal";
import { getEntityLabel } from "./-page-types";
import type { AccountsPageViewProps } from "./-page-view-types";
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
export function AccountsPageDialogs({
  managementContext = "accounts",
  rows,
  editingAccount,
  editingGroup,
  accountGroups,
  archivedAccountGroups = accountGroups,
  existingNodes,
  archivedExistingNodes = existingNodes,
  unitUsage,
  tab,
  onRefreshConstraints,
  createAccountGroupId,
  createGroupParentId,
  createModalOpened,
  createGroupModalOpened,
  editModalOpen,
  editGroupModalOpen,
  archivingRow,
  deletingRow,
  reorderingRow,
  selectedSiblingRows,
  onCloseCreateAccount,
  onSubmitCreateAccount,
  onCloseCreateGroup,
  onSubmitCreateGroup,
  onCloseEditAccount,
  onClearEditingAccount,
  onSubmitUpdateAccount,
  onCloseEditGroup,
  onClearEditingGroup,
  onSubmitUpdateGroup,
  onCloseArchive,
  onConfirmArchive,
  onCloseDelete,
  onConfirmDelete,
  onCloseReorder,
  onReorderSiblings,
}: Pick<
  AccountsPageViewProps,
  | "managementContext"
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
  | "reorderingRow"
  | "selectedSiblingRows"
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
  | "onCloseReorder"
  | "onReorderSiblings"
>) {
  const isEditingArchivedAccount = rows.some(
    (row) => row.id === editingAccount?.id && !row.isActive,
  );
  const isEditingArchivedGroup = rows.some(
    (row) => row.id === editingGroup?.id && !row.isActive,
  );

  const formatErrorMessage = (message: string) =>
    getAccountConstraintMessage(message, managementContext) ?? message;
  return (
    <>
      <>
        <EditAccountModal
          onRefreshConstraints={onRefreshConstraints}
          defaultGroupId={createAccountGroupId}
          opened={createModalOpened}
          onClose={onCloseCreateAccount}
          accountGroups={accountGroups}
          unitUsage={unitUsage}
          onSubmit={onSubmitCreateAccount}
          existingNodes={existingNodes}
          typeDescriptor={tab}
        />
        <ConfirmArchiveModal
          formatErrorMessage={formatErrorMessage}
          onRefreshConstraints={onRefreshConstraints}
          opened={!!archivingRow}
          onClose={onCloseArchive}
          title={
            archivingRow
              ? `Archive ${getEntityLabel(archivingRow.nodeType, managementContext)}`
              : "Archive"
          }
          name={archivingRow?.name}
          onConfirm={onConfirmArchive}
        />
      </>
      <EditAccountGroupModal
        onRefreshConstraints={onRefreshConstraints}
        defaultParentGroupId={createGroupParentId}
        opened={createGroupModalOpened}
        onClose={onCloseCreateGroup}
        accountGroups={accountGroups}
        onSubmit={onSubmitCreateGroup}
        existingNodes={existingNodes}
        typeDescriptor={tab}
      />
      <EditAccountModal
        onRefreshConstraints={onRefreshConstraints}
        opened={editModalOpen}
        onClose={onCloseEditAccount}
        onExitTransitionEnd={onClearEditingAccount}
        accountGroups={
          isEditingArchivedAccount ? archivedAccountGroups : accountGroups
        }
        unitUsage={unitUsage}
        onSubmit={onSubmitUpdateAccount}
        initialValues={editingAccount?.initialValues}
        existingNodes={
          isEditingArchivedAccount ? archivedExistingNodes : existingNodes
        }
        editingId={editingAccount?.id}
        typeDescriptor={tab}
      />
      <EditAccountGroupModal
        onRefreshConstraints={onRefreshConstraints}
        opened={editGroupModalOpen}
        onClose={onCloseEditGroup}
        onExitTransitionEnd={onClearEditingGroup}
        accountGroups={
          isEditingArchivedGroup ? archivedAccountGroups : accountGroups
        }
        onSubmit={onSubmitUpdateGroup}
        initialValues={editingGroup?.initialValues}
        existingNodes={
          isEditingArchivedGroup ? archivedExistingNodes : existingNodes
        }
        editingId={editingGroup?.id}
        typeDescriptor={tab}
      />
      <ConfirmDeleteModal
        formatErrorMessage={formatErrorMessage}
        onRefreshConstraints={onRefreshConstraints}
        opened={!!deletingRow}
        onClose={onCloseDelete}
        title={
          deletingRow
            ? `Delete ${getEntityLabel(deletingRow.nodeType, managementContext)}`
            : "Delete"
        }
        name={deletingRow?.name}
        onConfirm={onConfirmDelete}
      />
      <ReorderGroupChildrenModal
        key={reorderingRow?.parentKey}
        onRefreshConstraints={onRefreshConstraints}
        opened={!!reorderingRow}
        onClose={onCloseReorder}
        rowName={reorderingRow?.name ?? ""}
        initialRows={selectedSiblingRows}
        onReorder={onReorderSiblings}
      />
    </>
  );
}
