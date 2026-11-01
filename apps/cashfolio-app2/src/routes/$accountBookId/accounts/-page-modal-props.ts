import type { useAccountsPageModalState } from "./-page-modal-state";
import type { createAccountsMutationActions } from "./-account-mutations";

export function getAccountsModalViewProps(
  modalState: ReturnType<typeof useAccountsPageModalState>,
  actions: Pick<
    ReturnType<typeof createAccountsMutationActions>,
    | "handleCreateAccount"
    | "handleUpdateAccount"
    | "handleCreateGroup"
    | "handleUpdateGroup"
    | "handleDelete"
    | "handleArchive"
    | "handleReorderSiblings"
  >,
) {
  return {
    createAccountGroupId: modalState.createAccountGroupId,
    createGroupParentId: modalState.createGroupParentId,
    createModalOpened: modalState.createModalOpened,
    editModalOpen: modalState.editModalOpen,
    createGroupModalOpened: modalState.createGroupModalOpened,
    editGroupModalOpen: modalState.editGroupModalOpen,
    editingAccount: modalState.editingAccount,
    editingGroup: modalState.editingGroup,
    deletingRow: modalState.deletingRow,
    archivingRow: modalState.archivingRow,
    reorderingRow: modalState.reorderingRow,

    onOpenCreateGroup: () => modalState.openCreateGroup(),
    onOpenCreateAccount: () => modalState.openCreateAccount(),

    onCloseCreateAccount: () => modalState.setCreateModalOpened(false),
    onSubmitCreateAccount: actions.handleCreateAccount,
    onCloseEditAccount: () => modalState.setEditModalOpen(false),
    onClearEditingAccount: () => modalState.setEditingAccount(undefined),
    onSubmitUpdateAccount: actions.handleUpdateAccount,
    onCloseCreateGroup: () => modalState.setCreateGroupModalOpened(false),
    onSubmitCreateGroup: actions.handleCreateGroup,
    onCloseEditGroup: () => modalState.setEditGroupModalOpen(false),
    onClearEditingGroup: () => modalState.setEditingGroup(undefined),
    onSubmitUpdateGroup: actions.handleUpdateGroup,
    onCloseDelete: () => modalState.setDeletingRow(undefined),
    onConfirmDelete: actions.handleDelete,
    onCloseArchive: () => modalState.setArchivingRow(undefined),
    onConfirmArchive: actions.handleArchive,
    onCloseReorder: () => modalState.setReorderingRow(undefined),
    onReorderSiblings: actions.handleReorderSiblings,
  };
}
