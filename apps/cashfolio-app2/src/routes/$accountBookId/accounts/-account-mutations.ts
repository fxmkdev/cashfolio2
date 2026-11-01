import type { TransformedFormValues } from "@/components/account-editor/edit-account-modal";
import type { AccountGroupTransformedFormValues } from "@/components/account-editor/edit-account-group-modal";
import {
  archiveAccount,
  archiveAccountGroup,
  createAccount,
  createAccountGroup,
  deleteAccount,
  deleteAccountGroup,
  reorderAccountTreeItems,
  unarchiveAccount,
  unarchiveAccountGroup,
  updateAccount,
  updateAccountGroup,
} from "@/server/accounts";
import { type RowTarget, useAccountsPageModalState } from "./-page-modal-state";
export type AccountsMutationApi = {
  createAccount: typeof createAccount;
  updateAccount: typeof updateAccount;
  createAccountGroup: typeof createAccountGroup;
  updateAccountGroup: typeof updateAccountGroup;
  deleteAccount: typeof deleteAccount;
  deleteAccountGroup: typeof deleteAccountGroup;
  archiveAccount: typeof archiveAccount;
  archiveAccountGroup: typeof archiveAccountGroup;
  unarchiveAccount: typeof unarchiveAccount;
  unarchiveAccountGroup: typeof unarchiveAccountGroup;
  reorderAccountTreeItems: typeof reorderAccountTreeItems;
};

export type AccountsMutationState = {
  getEditingAccount: () => ReturnType<
    typeof useAccountsPageModalState
  >["editingAccount"];
  getEditingGroup: () => ReturnType<
    typeof useAccountsPageModalState
  >["editingGroup"];
  getDeletingRow: () => RowTarget | undefined;
  getArchivingRow: () => RowTarget | undefined;
  setCreateModalOpened: (opened: boolean) => void;
  setEditModalOpen: (opened: boolean) => void;
  setCreateGroupModalOpened: (opened: boolean) => void;
  setEditGroupModalOpen: (opened: boolean) => void;
  setDeletingRow: (row: RowTarget | undefined) => void;
  setArchivingRow: (row: RowTarget | undefined) => void;
};

const defaultAccountsMutationApi: AccountsMutationApi = {
  createAccount,
  updateAccount,
  createAccountGroup,
  updateAccountGroup,
  deleteAccount,
  deleteAccountGroup,
  archiveAccount,
  archiveAccountGroup,
  unarchiveAccount,
  unarchiveAccountGroup,
  reorderAccountTreeItems,
};

type MutationContext = {
  accountBookId: string;
  invalidate: () => void;
  state: AccountsMutationState;
  api: AccountsMutationApi;
};
function accountDetails(values: TransformedFormValues) {
  return {
    name: values.name!,
    assetClassId: values.assetClassId,
    trackingMethod: values.trackingMethod,

    type: values.type,
    equityAccountSubtype: values.equityAccountSubtype,
    groupId: values.groupId,
    sortOrder: values.sortOrder,
    unit: values.unit,
    currency: values.currency,
    cryptocurrency: values.cryptocurrency,
    symbol: values.symbol,
    tradeCurrency: values.tradeCurrency,
    statementImportCsvFormat: values.statementImportCsvFormat,
    isCashAccount: values.isCashAccount,
    openingBalance: values.openingBalance,
  };
}
function createAccountEditorActions(args: MutationContext) {
  const { api } = args;
  return {
    async handleCreateAccount(values: TransformedFormValues) {
      await api.createAccount({
        data: {
          accountBookId: args.accountBookId,
          ...accountDetails(values),
        },
      });
      args.state.setCreateModalOpened(false);
      args.invalidate();
    },

    async handleUpdateAccount(values: TransformedFormValues) {
      const editingAccount = args.state.getEditingAccount();
      if (!editingAccount) return;

      await api.updateAccount({
        data: {
          id: editingAccount.id,
          accountBookId: args.accountBookId,
          ...accountDetails(values),
        },
      });
      args.state.setEditModalOpen(false);
      args.invalidate();
    },
  };
}
function createGroupEditorActions(args: MutationContext) {
  const { api } = args;
  return {
    async handleCreateGroup(values: AccountGroupTransformedFormValues) {
      await api.createAccountGroup({
        data: {
          accountBookId: args.accountBookId,
          name: values.name!,
          type: values.type,
          equityAccountSubtype: values.equityAccountSubtype,
          parentGroupId: values.parentGroupId,
          sortOrder: values.sortOrder,
          isCashAccount: values.isCashAccount,
          isActive: true,
        },
      });
      args.state.setCreateGroupModalOpened(false);
      args.invalidate();
    },

    async handleUpdateGroup(values: AccountGroupTransformedFormValues) {
      const editingGroup = args.state.getEditingGroup();
      if (!editingGroup) return;

      await api.updateAccountGroup({
        data: {
          id: editingGroup.id,
          accountBookId: args.accountBookId,
          name: values.name!,
          type: values.type,
          equityAccountSubtype: values.equityAccountSubtype,
          parentGroupId: values.parentGroupId,
          sortOrder: values.sortOrder,
          isCashAccount: values.isCashAccount,
        },
      });
      args.state.setEditGroupModalOpen(false);
      args.invalidate();
    },
  };
}
function createTreeMutationActions(args: MutationContext) {
  const { api } = args;
  return {
    async handleDelete() {
      const deletingRow = args.state.getDeletingRow();
      if (!deletingRow) return;

      if (deletingRow.nodeType === "account") {
        await api.deleteAccount({
          data: { id: deletingRow.id, accountBookId: args.accountBookId },
        });
      } else {
        await api.deleteAccountGroup({
          data: { id: deletingRow.id, accountBookId: args.accountBookId },
        });
      }

      args.state.setDeletingRow(undefined);
      args.invalidate();
    },

    async handleArchive() {
      const archivingRow = args.state.getArchivingRow();
      if (!archivingRow) return;

      if (archivingRow.nodeType === "account") {
        await api.archiveAccount({
          data: { id: archivingRow.id, accountBookId: args.accountBookId },
        });
      } else {
        await api.archiveAccountGroup({
          data: { id: archivingRow.id, accountBookId: args.accountBookId },
        });
      }

      args.state.setArchivingRow(undefined);
      args.invalidate();
    },

    async handleUnarchiveRow(row: RowTarget) {
      if (row.nodeType === "account") {
        await api.unarchiveAccount({
          data: { id: row.id, accountBookId: args.accountBookId },
        });
      } else {
        await api.unarchiveAccountGroup({
          data: { id: row.id, accountBookId: args.accountBookId },
        });
      }
      args.invalidate();
    },

    async handleReorderSiblings(
      rows: { id: string; nodeType: "account" | "accountGroup" }[],
    ) {
      await api.reorderAccountTreeItems({
        data: {
          accountBookId: args.accountBookId,
          updates: rows.map((row, i) => ({
            id: row.id,
            nodeType: row.nodeType,
            sortOrder: i,
          })),
        },
      });
      args.invalidate();
    },
  };
}
export function createAccountsMutationActions(args: {
  accountBookId: string;
  invalidate: () => void;
  state: AccountsMutationState;
  api?: AccountsMutationApi;
}) {
  const context = { ...args, api: args.api ?? defaultAccountsMutationApi };
  return {
    ...createAccountEditorActions(context),
    ...createGroupEditorActions(context),
    ...createTreeMutationActions(context),
  };
}
