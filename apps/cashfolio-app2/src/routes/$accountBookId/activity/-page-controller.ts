import { useCallback, useState } from "react";
import {
  deleteTransaction,
  getTransaction,
  rebookBooking,
  updateTransaction,
} from "@/server/transactions";
import { useActivityAccountOptions } from "./-account-options";
import { useActivityColumnDefs } from "./-page-columns";
import type { loadActivityPageData } from "./-page-loader";
import type {
  ActivityPageViewProps,
  RebookingState,
  TransactionMutationValues,
} from "./-page-view";

type ActivityPageLoaderData = Awaited<ReturnType<typeof loadActivityPageData>>;

export function useActivityPageController(args: {
  loaderData: ActivityPageLoaderData;
  accountBookId: string;
  selectedPeriodValue?: string;
  pendingScrollRef: { current: string | undefined };
  invalidate: () => void;
}): Omit<ActivityPageViewProps, "accountBookId" | "onRowDataUpdated"> {
  const [editModalOpened, setEditModalOpened] = useState(false);
  const [isEditSubmitting, setIsEditSubmitting] = useState(false);
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
    editAccountOptions,
    hasCompleteBookingUnit,
    rebookTargetAccountOptions,
  } = useActivityAccountOptions({
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
    args.invalidate();
  };

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

  const columnDefs = useActivityColumnDefs({
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
    editModalOpened,
    isEditSubmitting,
    isRebookSubmitting,
    editingTransactionData,
    deletingTransaction,
    rebooking,
    rebookModalOpened,
    hasCompleteBookingUnit,
    editAccountOptions,
    rebookTargetAccountOptions,
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
