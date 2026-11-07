import { toAccountGridTreeRow, isPersistedTreeRow } from "../grid/rows";
import { useEffect } from "react";
import { useAccountsPageModalState } from "../dialogs/state";
import { getAccountsModalViewProps } from "../dialogs/props";
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
    if (startWithEditModal) {
      const row = toAccountGridTreeRow(
        activeAssetRows.find((row) => row.id === "account-checking")!,
      );
      if (isPersistedTreeRow(row)) handleEditRow(row);
    }
  }, [startWithEditModal, handleEditRow]);
  return state;
}

export function getStoryModalProps(
  state: ReturnType<typeof useStoryModals>,
  options: AccountsStoryOptions,
) {
  return getAccountsModalViewProps(state, {
    handleCreateAccount: async (values) => {
      await options.submitCreateAccount?.(values);
      state.setCreateModalOpened(false);
    },
    handleUpdateAccount: async (values) => {
      await options.submitUpdateAccount?.(values);
      state.setEditModalOpen(false);
    },
    handleCreateGroup: async (values) => {
      await options.submitCreateGroup?.(values);
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
  });
}
