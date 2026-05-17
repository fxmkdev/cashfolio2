import { useCallback, useState } from "react";
import {
  createTransaction,
  deleteTransaction,
  getTransaction,
  rebookBooking,
  updateTransaction,
} from "@/server/transactions";
import {
  getBookingPeriodValue,
  getLatestBookingDate,
} from "@/shared/transaction-period";
import { useTransactionsAccountOptions } from "./-account-options";
import { useTransactionsColumnDefs } from "./-page-columns";
import type { loadTransactionsPageData } from "./-page-loader";
import type {
  TransactionsPageViewProps,
  RebookingState,
  TransactionMutationValues,
} from "./-page-view";

type TransactionsPageLoaderData = Awaited<
  ReturnType<typeof loadTransactionsPageData>
>;

export function useTransactionsPageController(args: {
  loaderData: TransactionsPageLoaderData;
  accountBookId: string;
  selectedPeriodValue?: string;
  setPeriodFilter: (nextPeriodValue: string | undefined) => void;
  pendingScrollRef: { current: string | undefined };
  invalidate: () => void;
}): Omit<TransactionsPageViewProps, "accountBookId" | "onRowDataUpdated"> {
  const [editModalOpened, setEditModalOpened] = useState(false);
  const [createModalOpened, setCreateModalOpened] = useState(false);
  const [isEditSubmitting, setIsEditSubmitting] = useState(false);
  const [isCreateSubmitting, setIsCreateSubmitting] = useState(false);
  const [editingTransactionId, setEditingTransactionId] = useState<
    string | undefined
  >();
  const [editingTransactionData, setEditingTransactionData] = useState<
    Awaited<ReturnType<typeof getTransaction>> | undefined
  >();
  const [deletingTransaction, setDeletingTransaction] = useState<
    { id: string; description: string } | undefined
  >();
  const [rebooking, setRebooking] = useState<RebookingState | undefined>();
  const [rebookModalOpened, setRebookModalOpened] = useState(false);
  const [isRebookSubmitting, setIsRebookSubmitting] = useState(false);

  const {
    activeAccountOptions,
    editAccountOptions,
    hasCompleteBookingUnit,
    rebookTargetAccountOptions,
  } = useTransactionsAccountOptions({
    accounts: args.loaderData.accounts,
    editingTransactionData,
    rebooking,
  });

  const handleEditClick = useCallback(
    async (transactionId: string) => {
      const data = await getTransaction({
        data: { transactionId, accountBookId: args.accountBookId },
      });
      setEditingTransactionId(transactionId);
      setEditingTransactionData(data);
      setEditModalOpened(true);
    },
    [args.accountBookId],
  );

  const handleCreateTransaction = async (values: TransactionMutationValues) => {
    const transaction = await createTransaction({
      data: { accountBookId: args.accountBookId, ...values },
    });

    setCreateModalOpened(false);
    args.pendingScrollRef.current = transaction.id;
    reloadTransactionPeriod(values);
  };

  const handleUpdateTransaction = async (values: TransactionMutationValues) => {
    const editingId = editingTransactionId;
    if (!editingId) return;

    await updateTransaction({
      data: {
        accountBookId: args.accountBookId,
        transactionId: editingId,
        ...values,
      },
    });

    setEditModalOpened(false);
    args.pendingScrollRef.current = editingId;
    reloadTransactionPeriod(values);
  };

  function reloadTransactionPeriod(values: TransactionMutationValues) {
    const latestBookingDate = getLatestBookingDate(values.bookings);
    const nextPeriodValue = latestBookingDate
      ? getBookingPeriodValue({
          date: latestBookingDate,
          currentPeriodValue: args.selectedPeriodValue,
        })
      : args.selectedPeriodValue;

    if (nextPeriodValue && nextPeriodValue !== args.selectedPeriodValue) {
      args.setPeriodFilter(nextPeriodValue);
      return;
    }

    args.invalidate();
  }

  const handleRebookClick = useCallback((nextRebooking: RebookingState) => {
    setRebooking(nextRebooking);
    setRebookModalOpened(true);
  }, []);

  const handleRebookBooking = async (values: { targetAccountId: string }) => {
    if (!rebooking) return;

    await rebookBooking({
      data: {
        accountBookId: args.accountBookId,
        bookingId: rebooking.bookingId,
        targetAccountId: values.targetAccountId,
      },
    });

    setRebookModalOpened(false);
    args.pendingScrollRef.current = rebooking.transactionId;
    args.invalidate();
  };

  const handleDeleteClick = useCallback(
    (transactionId: string, description: string) => {
      setDeletingTransaction({ id: transactionId, description });
    },
    [],
  );

  const handleDeleteTransaction = async () => {
    if (!deletingTransaction) return;

    await deleteTransaction({
      data: {
        accountBookId: args.accountBookId,
        transactionId: deletingTransaction.id,
      },
    });

    setDeletingTransaction(undefined);
    args.invalidate();
  };

  const columnDefs = useTransactionsColumnDefs({
    accountBookId: args.accountBookId,
    selectedPeriodValue: args.selectedPeriodValue,
    referenceCurrency: args.loaderData.referenceCurrency,
    onEditClick: handleEditClick,
    onRebookClick: handleRebookClick,
    onDeleteClick: handleDeleteClick,
  });

  return {
    rows: args.loaderData.rows,
    columnDefs,
    accountBookStartDate: new Date(args.loaderData.periodBounds.minBookingDate),
    createModalOpened,
    editModalOpened,
    isCreateSubmitting,
    isEditSubmitting,
    isRebookSubmitting,
    editingTransactionData,
    deletingTransaction,
    rebooking,
    rebookModalOpened,
    hasCompleteBookingUnit,
    accountOptions: activeAccountOptions,
    editAccountOptions,
    rebookTargetAccountOptions,
    onAddTransactionClick: () => setCreateModalOpened(true),
    onCloseCreateModal: () => setCreateModalOpened(false),
    onCreateSubmittingChange: setIsCreateSubmitting,
    onSubmitCreateTransaction: handleCreateTransaction,
    onCloseEditModal: () => setEditModalOpened(false),
    onEditSubmittingChange: setIsEditSubmitting,
    onEditModalExitTransitionEnd: () => {
      setEditingTransactionId(undefined);
      setEditingTransactionData(undefined);
    },
    onSubmitUpdateTransaction: handleUpdateTransaction,
    onCloseRebookModal: () => setRebookModalOpened(false),
    onRebookSubmittingChange: setIsRebookSubmitting,
    onRebookModalExitTransitionEnd: () => {
      setRebooking(undefined);
    },
    onSubmitRebookBooking: handleRebookBooking,
    onCloseDeleteModal: () => setDeletingTransaction(undefined),
    onConfirmDeleteTransaction: handleDeleteTransaction,
  };
}
