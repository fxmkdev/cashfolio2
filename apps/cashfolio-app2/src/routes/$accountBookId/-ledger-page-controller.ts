import { useCallback, useMemo, useState } from "react";
import { AccountType, EquityAccountSubtype } from "../../.prisma-client/enums";
import type { SimpleTransactionDraftValues } from "../../components/simple-transaction-modal";
import {
  createSimpleTransaction,
  createTransaction,
  deleteTransaction,
  getTransaction,
  rebookBooking,
  updateTransaction,
} from "../../server/transactions";
import { useLedgerColumnDefs } from "./-ledger-page-columns";
import { useLedgerAccountOptions } from "./-ledger-page-account-options";
import {
  buildLedgerRows,
  deriveSimpleTransactionEditState,
  getUnitLabel,
  type SimpleTransactionEditInitialValues,
} from "./-ledger-page-data";
import {
  createEditTransactionPatchFromSimpleDraft,
  createSplitInitialValuesFromSimpleDraft,
  createUpdateTransactionPayloadFromSimpleValues,
} from "./-ledger-page-edit-flow";
import type { loadLedgerPageData } from "./-ledger-page-loader";
import { useLedgerRebookFlow } from "./-ledger-page-rebook-flow";
import {
  type EditMode,
  type LedgerPageViewProps,
  type RebookingState,
  type SimpleTransactionValues,
  type SplitModalInitialValues,
  type TransactionMutationValues,
} from "./-ledger-page-view";
import type { LedgerRow } from "./-ledger-page-types";

type LedgerPageLoaderData = Awaited<ReturnType<typeof loadLedgerPageData>>;

type TransactionApi = {
  createSimpleTransaction: typeof createSimpleTransaction;
  createTransaction: typeof createTransaction;
  updateTransaction: typeof updateTransaction;
  deleteTransaction: typeof deleteTransaction;
  getTransaction: typeof getTransaction;
  rebookBooking: typeof rebookBooking;
};

type LedgerMutationState = {
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

const defaultTransactionApi: TransactionApi = {
  createSimpleTransaction,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  getTransaction,
  rebookBooking,
};

export function createLedgerMutationActions(args: {
  accountBookId: string;
  accountId: string;
  invalidate: () => void;
  state: LedgerMutationState;
  pendingScrollRef: { current: string | undefined };
  api?: TransactionApi;
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

export function useLedgerPageController(args: {
  loaderData: LedgerPageLoaderData;
  accountBookId: string;
  pendingScrollRef: { current: string | undefined };
  invalidate: () => void;
}): Omit<
  LedgerPageViewProps,
  "accountBookId" | "onRowDataUpdated" | "viewSwitcher"
> {
  const { account, bookings, accounts } = args.loaderData;

  const [modalOpened, setModalOpened] = useState(false);
  const [simpleModalOpened, setSimpleModalOpened] = useState(false);
  const [editModalOpened, setEditModalOpened] = useState(false);
  const [isCreateSplitSubmitting, setIsCreateSplitSubmitting] = useState(false);
  const [isSimpleSubmitting, setIsSimpleSubmitting] = useState(false);
  const [isEditSubmitting, setIsEditSubmitting] = useState(false);
  const [createSplitInitialValues, setCreateSplitInitialValues] = useState<
    SplitModalInitialValues | undefined
  >();
  const [editMode, setEditMode] = useState<EditMode>("SPLIT");
  const [editingTransactionId, setEditingTransactionId] = useState<
    string | undefined
  >();
  const [editingTransactionData, setEditingTransactionData] = useState<
    Awaited<ReturnType<typeof getTransaction>> | undefined
  >();
  const [editingSimpleInitialValues, setEditingSimpleInitialValues] = useState<
    SimpleTransactionEditInitialValues | undefined
  >();
  const [deletingTransaction, setDeletingTransaction] = useState<
    { id: string; description: string } | undefined
  >();
  const [rebooking, setRebooking] = useState<RebookingState | undefined>();
  const [rebookModalOpened, setRebookModalOpened] = useState(false);
  const [isRebookSubmitting, setIsRebookSubmitting] = useState(false);

  const {
    allAccountOptions,
    accountOptions,
    editAccountOptions,
    simpleCounterAccountOptions,
    currentAccountLabel,
    currentAccountOption,
    editSimpleCounterAccountOptions,
    simpleTransactionDisabledReason,
  } = useLedgerAccountOptions({
    account,
    accounts,
    editingTransactionData,
    editingSimpleInitialValues,
  });

  const actions = createLedgerMutationActions({
    accountBookId: args.accountBookId,
    accountId: account.id,
    invalidate: args.invalidate,
    pendingScrollRef: args.pendingScrollRef,
    state: {
      getEditingTransactionId: () => editingTransactionId,
      getDeletingTransaction: () => deletingTransaction,
      getRebooking: () => rebooking,
      setModalOpened,
      setSimpleModalOpened,
      setEditModalOpened,
      setCreateSplitInitialValues,
      setDeletingTransaction,
      setRebookModalOpened,
    },
  });

  const currentAccountForSimpleTransaction = {
    id: currentAccountOption.value,
    unit: currentAccountOption.unit,
    currency: currentAccountOption.currency,
    cryptocurrency: currentAccountOption.cryptocurrency,
    symbol: currentAccountOption.symbol,
    tradeCurrency: currentAccountOption.tradeCurrency,
  };

  const handleSwitchCreateToSplit = (draft: SimpleTransactionDraftValues) => {
    setCreateSplitInitialValues(
      createSplitInitialValuesFromSimpleDraft({
        draft,
        fallback: {
          date: new Date(),
          description: "",
          counterAccountId: simpleCounterAccountOptions[0]?.value ?? "",
          amount: 1,
          direction: "DEBIT",
        },
        allAccountOptions,
        currentAccount: currentAccountForSimpleTransaction,
      }),
    );
    setSimpleModalOpened(false);
    setModalOpened(true);
  };

  const handleEditClick = useCallback(
    async (transactionId: string) => {
      const data = await actions.getTransaction({
        data: { transactionId, accountBookId: args.accountBookId },
      });
      const simpleEditState = deriveSimpleTransactionEditState({
        transaction: data,
        currentAccountId: account.id,
      });

      setEditingTransactionId(transactionId);
      setEditingTransactionData(data);
      if (
        simpleEditState.eligible &&
        simpleTransactionDisabledReason === null
      ) {
        setEditMode("SIMPLE");
        setEditingSimpleInitialValues(simpleEditState.initialValues);
      } else {
        setEditMode("SPLIT");
        setEditingSimpleInitialValues(undefined);
      }
      setEditModalOpened(true);
    },
    [account.id, actions, args.accountBookId, simpleTransactionDisabledReason],
  );

  const handleUpdateSimpleTransaction = async (
    values: SimpleTransactionValues,
  ) => {
    const editingId = editingTransactionId;
    if (!editingId) return;

    const payload = createUpdateTransactionPayloadFromSimpleValues({
      values,
      allAccountOptions,
      currentAccount: currentAccountForSimpleTransaction,
    });

    await actions.updateTransaction({
      data: {
        accountBookId: args.accountBookId,
        transactionId: editingId,
        ...payload,
      },
    });

    setEditModalOpened(false);
    args.pendingScrollRef.current = editingId;
    args.invalidate();
  };

  const handleSwitchToSplit = (draft: SimpleTransactionDraftValues) => {
    if (!editingSimpleInitialValues || !editingTransactionData) {
      return;
    }

    setEditingTransactionData({
      ...editingTransactionData,
      ...createEditTransactionPatchFromSimpleDraft({
        draft,
        fallback: editingSimpleInitialValues,
        allAccountOptions,
        currentAccount: currentAccountForSimpleTransaction,
        transactionId: editingTransactionData.id,
      }),
    });
    setEditMode("SPLIT");
  };

  const handleRebookClick = useCallback((nextRebooking: RebookingState) => {
    setRebooking(nextRebooking);
    setRebookModalOpened(true);
  }, []);

  const { hasCompleteBookingUnit, rebookTargetAccountOptions } =
    useLedgerRebookFlow({
      rebooking,
      currentAccountId: account.id,
      accounts,
      accountOptions,
    });

  const isEquity = account.type === AccountType.EQUITY;
  const isIncome =
    account.type === AccountType.EQUITY &&
    account.equityAccountSubtype === EquityAccountSubtype.INCOME;
  const isExpense =
    account.type === AccountType.EQUITY &&
    account.equityAccountSubtype === EquityAccountSubtype.EXPENSE;

  const handleDeleteClick = useCallback(
    (transactionId: string, description: string) => {
      setDeletingTransaction({ id: transactionId, description });
    },
    [],
  );

  const rows = useMemo(
    () => buildLedgerRows(account, bookings),
    [account, bookings],
  );

  const columnDefs = useLedgerColumnDefs({
    accountBookId: args.accountBookId,
    isEquity,
    isIncome,
    isExpense,
    onEditClick: handleEditClick,
    onRebookClick: handleRebookClick,
    onDeleteClick: handleDeleteClick,
  });

  const unitLabel = getUnitLabel(account);

  const backTab = (
    account.type === AccountType.EQUITY && account.equityAccountSubtype
      ? `EQUITY-${account.equityAccountSubtype}`
      : account.type
  ) as "ASSET" | "LIABILITY" | `EQUITY-${EquityAccountSubtype}`;

  return {
    backTab,
    account,
    rows,
    columnDefs,
    currentAccountLabel,
    unitLabel,
    simpleTransactionDisabledReason,
    simpleModalOpened,
    splitModalOpened: modalOpened,
    editModalOpened,
    isSimpleSubmitting,
    isCreateSplitSubmitting,
    isEditSubmitting,
    isRebookSubmitting,
    editMode,
    createSplitInitialValues,
    editingTransactionData,
    editingSimpleInitialValues,
    deletingTransaction,
    rebooking,
    rebookModalOpened,
    hasCompleteBookingUnit,
    accountOptions,
    editAccountOptions,
    simpleCounterAccountOptions,
    editSimpleCounterAccountOptions,
    rebookTargetAccountOptions,
    onAddTransactionClick: () => {
      setCreateSplitInitialValues(undefined);
      if (simpleTransactionDisabledReason) {
        setModalOpened(true);
        return;
      }
      setSimpleModalOpened(true);
    },
    onCloseSimpleModal: () => setSimpleModalOpened(false),
    onSimpleSubmittingChange: setIsSimpleSubmitting,
    onSwitchCreateToSplit: handleSwitchCreateToSplit,
    onSubmitCreateSimpleTransaction: actions.handleCreateSimpleTransaction,
    onCloseSplitModal: () => {
      setModalOpened(false);
      setCreateSplitInitialValues(undefined);
    },
    onCreateSplitSubmittingChange: setIsCreateSplitSubmitting,
    onSubmitCreateTransaction: actions.handleCreateTransaction,
    onCloseEditModal: () => setEditModalOpened(false),
    onEditSubmittingChange: setIsEditSubmitting,
    onEditModalExitTransitionEnd: () => {
      setEditingTransactionId(undefined);
      setEditingTransactionData(undefined);
      setEditingSimpleInitialValues(undefined);
      setEditMode("SPLIT");
    },
    onSwitchToSplit: handleSwitchToSplit,
    onSubmitUpdateSimpleTransaction: handleUpdateSimpleTransaction,
    onSubmitUpdateTransaction: actions.handleUpdateTransaction,
    onCloseRebookModal: () => setRebookModalOpened(false),
    onRebookSubmittingChange: setIsRebookSubmitting,
    onRebookModalExitTransitionEnd: () => {
      setRebooking(undefined);
    },
    onSubmitRebookBooking: actions.handleRebookBooking,
    onCloseDeleteModal: () => setDeletingTransaction(undefined),
    onConfirmDeleteTransaction: actions.handleDeleteTransaction,
  };
}
