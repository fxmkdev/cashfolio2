import type { TransformedFormValues } from "@/components/edit-account-modal";
import {
  archiveAccount,
  deleteAccount,
  unarchiveAccount,
  updateAccount,
} from "@/server/accounts";
import {
  createSimpleTransaction,
  createTransaction,
  deleteTransaction,
  getTransaction,
  rebookBooking,
  updateTransaction,
} from "@/server/transactions";
import type {
  RebookingState,
  SimpleTransactionValues,
  SplitModalInitialValues,
  TransactionMutationValues,
} from "./-page-view";

export type LedgerTransactionApi = {
  createSimpleTransaction: typeof createSimpleTransaction;
  createTransaction: typeof createTransaction;
  updateTransaction: typeof updateTransaction;
  deleteTransaction: typeof deleteTransaction;
  getTransaction: typeof getTransaction;
  rebookBooking: typeof rebookBooking;
};

export type LedgerAccountApi = {
  updateAccount: typeof updateAccount;
  deleteAccount: typeof deleteAccount;
  archiveAccount: typeof archiveAccount;
  unarchiveAccount: typeof unarchiveAccount;
};

export type LedgerMutationState = {
  getEditingTransactionId: () => string | undefined;
  getDeletingTransaction: () => { id: string; description: string } | undefined;
  getRebooking: () => RebookingState | undefined;
  setModalOpened: (opened: boolean) => void;
  setSimpleModalOpened: (opened: boolean) => void;
  setEditModalOpened: (opened: boolean) => void;
  setCreateSplitInitialValues: (
    values: SplitModalInitialValues | undefined,
  ) => void;
  setDeletingTransaction: (
    value: { id: string; description: string } | undefined,
  ) => void;
  setRebookModalOpened: (opened: boolean) => void;
};

export type LedgerAccountMutationState = {
  setAccountEditModalOpened: (opened: boolean) => void;
  setDeletingAccount: (deleting: boolean) => void;
  setArchivingAccount: (archiving: boolean) => void;
};

const defaultTransactionApi: LedgerTransactionApi = {
  createSimpleTransaction,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  getTransaction,
  rebookBooking,
};

const defaultAccountApi: LedgerAccountApi = {
  updateAccount,
  deleteAccount,
  archiveAccount,
  unarchiveAccount,
};

export function createLedgerMutationActions(args: {
  accountBookId: string;
  accountId: string;
  invalidate: () => void;
  state: LedgerMutationState;
  pendingScrollRef: { current: string | undefined };
  api?: LedgerTransactionApi;
}) {
  const api = args.api ?? defaultTransactionApi;

  return {
    async handleCreateTransaction(values: TransactionMutationValues) {
      const transaction = await api.createTransaction({
        data: { accountBookId: args.accountBookId, ...values },
      });
      args.state.setModalOpened(false);
      args.state.setCreateSplitInitialValues(undefined);
      args.pendingScrollRef.current = transaction.id;
      args.invalidate();
    },

    async handleCreateSimpleTransaction(values: SimpleTransactionValues) {
      const transaction = await api.createSimpleTransaction({
        data: {
          accountBookId: args.accountBookId,
          accountId: args.accountId,
          ...values,
        },
      });
      args.state.setSimpleModalOpened(false);
      args.pendingScrollRef.current = transaction.id;
      args.invalidate();
    },

    async handleUpdateTransaction(values: TransactionMutationValues) {
      const editingTransactionId = args.state.getEditingTransactionId();
      if (!editingTransactionId) return;

      await api.updateTransaction({
        data: {
          accountBookId: args.accountBookId,
          transactionId: editingTransactionId,
          ...values,
        },
      });
      args.state.setEditModalOpened(false);
      args.pendingScrollRef.current = editingTransactionId;
      args.invalidate();
    },

    async handleDeleteTransaction() {
      const deletingTransaction = args.state.getDeletingTransaction();
      if (!deletingTransaction) return;

      await api.deleteTransaction({
        data: {
          transactionId: deletingTransaction.id,
          accountBookId: args.accountBookId,
        },
      });
      args.state.setDeletingTransaction(undefined);
      args.invalidate();
    },

    async handleRebookBooking(values: { targetAccountId: string }) {
      const rebooking = args.state.getRebooking();
      if (!rebooking) return;

      await api.rebookBooking({
        data: {
          accountBookId: args.accountBookId,
          bookingId: rebooking.bookingId,
          targetAccountId: values.targetAccountId,
        },
      });

      args.state.setRebookModalOpened(false);
      args.pendingScrollRef.current = rebooking.transactionId;
      args.invalidate();
    },

    getTransaction: api.getTransaction,
    updateTransaction: api.updateTransaction,
  };
}

export function createLedgerAccountMutationActions(args: {
  accountBookId: string;
  accountId: string;
  invalidate: () => void;
  onAccountDeleted: () => void | Promise<void>;
  state: LedgerAccountMutationState;
  api?: LedgerAccountApi;
}) {
  const api = args.api ?? defaultAccountApi;

  return {
    async handleUpdateAccount(values: TransformedFormValues) {
      await api.updateAccount({
        data: {
          id: args.accountId,
          accountBookId: args.accountBookId,
          name: values.name!,
          type: values.type,
          equityAccountSubtype: values.equityAccountSubtype,
          groupId: values.groupId,
          sortOrder: values.sortOrder,
          unit: values.unit,
          currency: values.currency,
          cryptocurrency: values.cryptocurrency,
          symbol: values.symbol,
          tradeCurrency: values.tradeCurrency,
          openingBalance: values.openingBalance,
        },
      });
      args.state.setAccountEditModalOpened(false);
      args.invalidate();
    },

    async handleArchiveAccount() {
      await api.archiveAccount({
        data: { id: args.accountId, accountBookId: args.accountBookId },
      });
      args.state.setArchivingAccount(false);
      args.invalidate();
    },

    async handleUnarchiveAccount() {
      await api.unarchiveAccount({
        data: { id: args.accountId, accountBookId: args.accountBookId },
      });
      args.invalidate();
    },

    async handleDeleteAccount() {
      await api.deleteAccount({
        data: { id: args.accountId, accountBookId: args.accountBookId },
      });
      args.state.setDeletingAccount(false);
      await args.onAccountDeleted();
      args.invalidate();
    },
  };
}
