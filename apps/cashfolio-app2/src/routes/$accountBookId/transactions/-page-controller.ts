import { useRefreshedMutationData } from "@/hooks/use-refreshed-mutation-data";
import { useBulkTransactionActions } from "@/hooks/use-bulk-transaction-actions";
import { useCallback, useState } from "react";
import {
  createTransaction,
  deleteTransaction,
  deleteTransactions,
  getTransaction,
  rebookBooking,
  updateTransaction,
} from "@/server/transactions";
import { createCopyTransactionInitialValues } from "@/components/edit-transaction-modal-values";
import {
  getBookingPeriodValue,
  getLatestBookingDate,
} from "@/shared/transaction-period";
import { useTransactionsAccountOptions } from "./-account-options";
import { useTransactionsColumnDefs } from "./-page-columns";
import { loadTransactionsPageData } from "./-page-loader";
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
  const { data: loaderData, refresh: onRefreshConstraints } =
    useRefreshedMutationData(args.loaderData, () =>
      loadTransactionsPageData({
        accountBookId: args.accountBookId,
        period: args.selectedPeriodValue,
      }),
    );
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
  const [createTransactionInitialValues, setCreateTransactionInitialValues] =
    useState<TransactionsPageViewProps["createTransactionInitialValues"]>();
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
    accounts: loaderData.accounts,
    editingTransactionData:
      editingTransactionData ?? createTransactionInitialValues,
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
    setCreateTransactionInitialValues(undefined);
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

  const handleCopyClick = useCallback(
    async (transactionId: string) => {
      const data = await getTransaction({
        data: { transactionId, accountBookId: args.accountBookId },
      });
      setCreateTransactionInitialValues(
        createCopyTransactionInitialValues(data),
      );
      setCreateModalOpened(true);
    },
    [args.accountBookId],
  );

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

  const { columnDefs, detailColumnDefs } = useTransactionsColumnDefs({
    accountBookId: args.accountBookId,
    selectedPeriodValue: args.selectedPeriodValue,
    referenceCurrency: loaderData.referenceCurrency,
    onEditClick: handleEditClick,
    onRebookClick: handleRebookClick,
    onCopyClick: handleCopyClick,
    onDeleteClick: handleDeleteClick,
  });

  const bulkActions = useBulkTransactionActions({
    scopeKey: `${args.accountBookId}:${args.selectedPeriodValue ?? ""}`,
    deleteTransactions: (transactionIds) =>
      deleteTransactions({
        data: { accountBookId: args.accountBookId, transactionIds },
      }),
    rows: loaderData.rows,
    invalidate: args.invalidate,
    onRefreshConstraints,
  });

  return {
    onRefreshConstraints,
    rows: loaderData.rows,
    bulkActions,
    columnDefs,
    detailColumnDefs,
    accountBookStartDate: new Date(loaderData.periodBounds.minBookingDate),
    createModalOpened,
    editModalOpened,
    isCreateSubmitting,
    isEditSubmitting,
    isRebookSubmitting,
    createTransactionInitialValues,
    editingTransactionData,
    deletingTransaction,
    rebooking,
    rebookModalOpened,
    hasCompleteBookingUnit,
    accountOptions: createTransactionInitialValues
      ? editAccountOptions
      : activeAccountOptions,
    editAccountOptions,
    rebookTargetAccountOptions,
    onAddTransactionClick: () => {
      setCreateTransactionInitialValues(undefined);
      setCreateModalOpened(true);
    },
    onCloseCreateModal: () => {
      setCreateModalOpened(false);
      setCreateTransactionInitialValues(undefined);
    },
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
