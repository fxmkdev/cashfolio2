import { useState } from "react";
import { editTransactionInitialValues } from "@/components/testing/storybook-fixtures";
import type {
  LedgerPageViewProps,
  EditMode,
  RebookingState,
} from "./page-view.types";
import type { LedgerPageStoryOptions } from "./page-view.story-fixtures";

export function useLedgerStoryAccountDialogs(
  account: LedgerPageViewProps["account"],
) {
  const [accountEditModalOpened, setAccountEditModalOpened] = useState(false);
  const [archivingAccount, setArchivingAccount] =
    useState<LedgerPageViewProps["archivingAccount"]>();
  const [deletingAccount, setDeletingAccount] =
    useState<LedgerPageViewProps["deletingAccount"]>();
  return {
    props: {
      accountEditModalOpened,
      archivingAccount,
      deletingAccount,
      onOpenAccountEdit: () => setAccountEditModalOpened(true),
      onCloseAccountEdit: () => setAccountEditModalOpened(false),
      onSubmitUpdateAccount: async () => {
        setAccountEditModalOpened(false);
      },
      onOpenArchiveAccount: () =>
        setArchivingAccount({ id: account.id, name: account.name }),
      onCloseArchiveAccount: () => setArchivingAccount(undefined),
      onConfirmArchiveAccount: async () => {
        setArchivingAccount(undefined);
      },
      onUnarchiveAccount: async () => undefined,
      onOpenDeleteAccount: () =>
        setDeletingAccount({ id: account.id, name: account.name }),
      onCloseDeleteAccount: () => setDeletingAccount(undefined),
      onConfirmDeleteAccount: async () => {
        setDeletingAccount(undefined);
      },
    } satisfies Partial<LedgerPageViewProps>,
  };
}

export function useLedgerStoryCreateDialogs(
  options: Pick<
    LedgerPageStoryOptions,
    "startWithSimpleModal" | "startWithSplitModal"
  >,
) {
  const [simpleModalOpened, setSimpleModalOpened] = useState(
    options.startWithSimpleModal ?? false,
  );
  const [splitModalOpened, setSplitModalOpened] = useState(
    options.startWithSplitModal ?? false,
  );
  const [isSimpleSubmitting, setIsSimpleSubmitting] = useState(false);
  const [isCreateSplitSubmitting, setIsCreateSplitSubmitting] = useState(false);
  return {
    onCopy: () => setSplitModalOpened(true),
    props: {
      simpleModalOpened,
      splitModalOpened,
      isSimpleSubmitting,
      isCreateSplitSubmitting,
      onAddTransactionClick: () => {
        setSplitModalOpened(false);
        setSimpleModalOpened(true);
      },
      onCloseSimpleModal: () => setSimpleModalOpened(false),
      onSimpleModalExitTransitionEnd: () => undefined,
      onSimpleSubmittingChange: setIsSimpleSubmitting,
      onSwitchCreateToSplit: () => {
        setSimpleModalOpened(false);
        setSplitModalOpened(true);
      },
      onSubmitCreateSimpleTransaction: async () => {
        setSimpleModalOpened(false);
      },
      onCloseSplitModal: () => setSplitModalOpened(false),
      onCreateSplitSubmittingChange: setIsCreateSplitSubmitting,
      onSubmitCreateTransaction: async () => {
        setSplitModalOpened(false);
      },
    } satisfies Partial<LedgerPageViewProps>,
  };
}

export function useLedgerStoryEditDialog(
  options: Pick<LedgerPageStoryOptions, "startWithEditModal">,
) {
  const [editModalOpened, setEditModalOpened] = useState(
    options.startWithEditModal ?? false,
  );
  const [isEditSubmitting, setIsEditSubmitting] = useState(false);
  const [editMode, setEditMode] = useState<EditMode>("SPLIT");
  const [editingTransactionData, setEditingTransactionData] = useState<
    LedgerPageViewProps["editingTransactionData"]
  >(
    options.startWithEditModal
      ? {
          id: "transaction-2",
          description: editTransactionInitialValues.description,
          bookings: editTransactionInitialValues.bookings,
        }
      : undefined,
  );
  const [editingSimpleInitialValues, setEditingSimpleInitialValues] =
    useState<LedgerPageViewProps["editingSimpleInitialValues"]>();
  return {
    onEdit: (transactionId: string) => {
      setEditingTransactionData({
        id: transactionId,
        description: editTransactionInitialValues.description,
        bookings: editTransactionInitialValues.bookings,
      });
      setEditModalOpened(true);
      setEditMode("SPLIT");
    },
    props: {
      editModalOpened,
      isEditSubmitting,
      editMode,
      editingTransactionData,
      editingSimpleInitialValues,
      onCloseEditModal: () => setEditModalOpened(false),
      onEditSubmittingChange: setIsEditSubmitting,
      onEditModalExitTransitionEnd: () => {
        setEditingTransactionData(undefined);
        setEditingSimpleInitialValues(undefined);
        setEditMode("SPLIT");
      },
      onSwitchToSplit: () => {
        setEditMode("SPLIT");
        setEditingSimpleInitialValues(undefined);
      },
      onSubmitUpdateSimpleTransaction: async () => {
        setEditModalOpened(false);
      },
      onSubmitUpdateTransaction: async () => {
        setEditModalOpened(false);
      },
    } satisfies Partial<LedgerPageViewProps>,
  };
}

export function useLedgerStoryTransactionActions() {
  const [rebookModalOpened, setRebookModalOpened] = useState(false);
  const [isRebookSubmitting, setIsRebookSubmitting] = useState(false);
  const [rebooking, setRebooking] = useState<RebookingState>();
  const [deletingTransaction, setDeletingTransaction] =
    useState<LedgerPageViewProps["deletingTransaction"]>();
  return {
    onRebook: (value: RebookingState) => {
      setRebooking(value);
      setRebookModalOpened(true);
    },
    onDelete: (id: string, description: string) =>
      setDeletingTransaction({ id, description }),
    props: {
      rebookModalOpened,
      isRebookSubmitting,
      rebooking,
      deletingTransaction,
      onCloseRebookModal: () => setRebookModalOpened(false),
      onRebookSubmittingChange: setIsRebookSubmitting,
      onRebookModalExitTransitionEnd: () => setRebooking(undefined),
      onSubmitRebookBooking: async () => {
        setRebookModalOpened(false);
      },
      onCloseDeleteModal: () => setDeletingTransaction(undefined),
      onConfirmDeleteTransaction: async () => {
        setDeletingTransaction(undefined);
      },
    } satisfies Partial<LedgerPageViewProps>,
  };
}
