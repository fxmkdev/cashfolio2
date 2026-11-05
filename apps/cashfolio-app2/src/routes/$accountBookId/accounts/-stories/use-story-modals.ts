import { useEffect } from "react";
import { useAccountsPageModalState } from "../-page-modal-state";
import { getAccountsModalViewProps } from "../-page-modal-props";
import { activeAssetRows } from "./fixtures";
import type { AccountsStoryOptions } from "./types";

export function useStoryModals({
  initialTab = "BALANCE",
  startWithCreateModal = false,
  startWithEditModal = false,
}: AccountsStoryOptions) {
  const state = useAccountsPageModalState(initialTab);
  const { openCreateAccount, handleEditRow } = state;
  useEffect(() => {
    if (startWithCreateModal) openCreateAccount();
  }, [startWithCreateModal, openCreateAccount]);
  useEffect(() => {
    if (startWithEditModal)
      handleEditRow(
        activeAssetRows.find((row) => row.id === "account-checking")!,
      );
  }, [startWithEditModal, handleEditRow]);
  return state;
}

export function getStoryModalProps(state: ReturnType<typeof useStoryModals>) {
  return getAccountsModalViewProps(state, {
    handleCreateAccount: async () => {
      state.setCreateModalOpened(false);
    },
    handleUpdateAccount: async () => {
      state.setEditModalOpen(false);
    },
    handleCreateGroup: async () => {
      state.setCreateGroupModalOpened(false);
    },
    handleUpdateGroup: async () => {
      state.setEditGroupModalOpen(false);
    },
    handleArchive: async () => {
      state.setArchivingRow(undefined);
    },
    handleDelete: async () => {
      state.setDeletingRow(undefined);
    },
    handleReorderSiblings: async () => {
      state.setReorderingRow(undefined);
    },
  });
}
