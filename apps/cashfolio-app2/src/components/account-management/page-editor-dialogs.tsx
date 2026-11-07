import { EditAccountGroupModal } from "@/components/account-editor/edit-account-group-modal";
import { EditAccountModal } from "@/components/account-editor/edit-account-modal";
import type { AccountsPageViewProps } from "./page-view-types";
type CreateAccountDialogProps = Pick<
  AccountsPageViewProps,
  | "editorSubmitState"
  | "onRefreshConstraints"
  | "createAccountGroupId"
  | "createModalOpened"
  | "onCloseCreateAccount"
  | "accountGroups"
  | "unitUsage"
  | "onSubmitCreateAccount"
  | "existingNodes"
  | "tab"
>;

export function CreateAccountDialog(props: CreateAccountDialogProps) {
  const {
    editorSubmitState,
    onRefreshConstraints,
    createAccountGroupId,
    createModalOpened,
    onCloseCreateAccount,
    accountGroups,
    unitUsage,
    onSubmitCreateAccount,
    existingNodes,
    tab,
  } = props;

  return (
    <EditAccountModal
      submitState={editorSubmitState}
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
  );
}

type CreateGroupDialogProps = Pick<
  AccountsPageViewProps,
  | "editorSubmitState"
  | "onRefreshConstraints"
  | "createGroupParentId"
  | "createGroupModalOpened"
  | "onCloseCreateGroup"
  | "accountGroups"
  | "onSubmitCreateGroup"
  | "existingNodes"
  | "tab"
>;

export function CreateGroupDialog(props: CreateGroupDialogProps) {
  const {
    editorSubmitState,
    onRefreshConstraints,
    createGroupParentId,
    createGroupModalOpened,
    onCloseCreateGroup,
    accountGroups,
    onSubmitCreateGroup,
    existingNodes,
    tab,
  } = props;

  return (
    <EditAccountGroupModal
      submitState={editorSubmitState}
      onRefreshConstraints={onRefreshConstraints}
      defaultParentGroupId={createGroupParentId}
      opened={createGroupModalOpened}
      onClose={onCloseCreateGroup}
      accountGroups={accountGroups}
      onSubmit={onSubmitCreateGroup}
      existingNodes={existingNodes}
      typeDescriptor={tab}
    />
  );
}

type EditAccountDialogProps = Pick<
  AccountsPageViewProps,
  | "editorSubmitState"
  | "onRefreshConstraints"
  | "editModalOpen"
  | "onCloseEditAccount"
  | "onClearEditingAccount"
  | "archivedAccountGroups"
  | "accountGroups"
  | "unitUsage"
  | "onSubmitUpdateAccount"
  | "editingAccount"
  | "archivedExistingNodes"
  | "existingNodes"
  | "tab"
  | "rows"
>;

export function EditAccountDialog(props: EditAccountDialogProps) {
  const {
    editorSubmitState,
    onRefreshConstraints,
    editModalOpen,
    onCloseEditAccount,
    onClearEditingAccount,
    accountGroups,
    archivedAccountGroups = accountGroups,
    unitUsage,
    onSubmitUpdateAccount,
    editingAccount,
    existingNodes,
    archivedExistingNodes = existingNodes,
    tab,
    rows,
  } = props;
  const isEditingArchivedAccount = rows.some(
    (row) => row.id === editingAccount?.id && !row.isActive,
  );
  return (
    <EditAccountModal
      submitState={editorSubmitState}
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
  );
}

type EditGroupDialogProps = Pick<
  AccountsPageViewProps,
  | "editorSubmitState"
  | "onRefreshConstraints"
  | "editGroupModalOpen"
  | "onCloseEditGroup"
  | "onClearEditingGroup"
  | "archivedAccountGroups"
  | "accountGroups"
  | "onSubmitUpdateGroup"
  | "editingGroup"
  | "archivedExistingNodes"
  | "existingNodes"
  | "tab"
  | "rows"
>;

export function EditGroupDialog(props: EditGroupDialogProps) {
  const {
    editorSubmitState,
    onRefreshConstraints,
    editGroupModalOpen,
    onCloseEditGroup,
    onClearEditingGroup,
    accountGroups,
    archivedAccountGroups = accountGroups,
    onSubmitUpdateGroup,
    editingGroup,
    existingNodes,
    archivedExistingNodes = existingNodes,
    tab,
    rows,
  } = props;
  const isEditingArchivedGroup = rows.some(
    (row) => row.id === editingGroup?.id && !row.isActive,
  );
  return (
    <EditAccountGroupModal
      submitState={editorSubmitState}
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
  );
}
