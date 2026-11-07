import type { useAccountsPageModalState } from "./state";
import type { createAccountsMutationActions } from "../management/mutations";

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
  >,
) {
  return {
    movingRow: modalState.movingRow,
    onCloseMove: () => modalState.setMovingRow(undefined),
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
  };
}
