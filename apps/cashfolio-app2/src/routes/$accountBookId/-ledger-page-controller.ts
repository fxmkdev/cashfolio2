import { useCallback, useMemo, useState } from "react";
import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../../.prisma-client/enums";
import type { AccountOption } from "../../components/edit-transaction-modal";
import type { SimpleTransactionDraftValues } from "../../components/simple-transaction-modal";
import {
  getBookingUnitIdentifier,
  isBookingValueCompatibleWithAccountType,
  isBookingUnitCompatibleWithAccount,
} from "../../shared/account-utils";
import {
  createSimpleTransaction,
  createTransaction,
  deleteTransaction,
  getTransaction,
  rebookBooking,
  updateTransaction,
} from "../../server/transactions";
import { useLedgerColumnDefs } from "./-ledger-page-columns";
import {
  buildLedgerRows,
  createAccountOptions,
  createCurrentAccountLabel,
  deriveSimpleTransactionEditState,
  getSimpleTransactionDisabledReason,
  getSimpleTransactionUnitIdentifier,
  type SimpleTransactionEditInitialValues,
  getUnitLabel,
} from "./-ledger-page-data";
import {
  buildSimpleTransactionValues,
  normalizeSimpleDraft,
  toCreateSplitInitialValues,
  toEditTransactionData,
} from "./-ledger-page-transaction-utils";
import type { loadLedgerPageData } from "./-ledger-page-loader";
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

  const allAccountOptions = useMemo<AccountOption[]>(
    () => createAccountOptions(accounts, () => true),
    [accounts],
  );

  const accountOptions = useMemo<AccountOption[]>(
    () => createAccountOptions(accounts, (a) => a.isActive),
    [accounts],
  );

  const editAccountOptions = useMemo<AccountOption[]>(() => {
    if (!editingTransactionData) return accountOptions;

    const selectedAccountIds = new Set([
      account.id,
      ...editingTransactionData.bookings
        .map((b) => b.account)
        .filter((id): id is string => Boolean(id)),
    ]);

    return createAccountOptions(
      accounts,
      (a) => a.isActive || selectedAccountIds.has(a.id),
    );
  }, [account.id, accountOptions, accounts, editingTransactionData]);

  const currentSimpleUnitIdentifier = useMemo(
    () => getSimpleTransactionUnitIdentifier(account),
    [account],
  );

  const simpleCounterAccountOptions = useMemo<AccountOption[]>(
    () =>
      createAccountOptions(
        accounts,
        (candidate) =>
          candidate.isActive &&
          candidate.id !== account.id &&
          (candidate.type === AccountType.EQUITY ||
            ((candidate.type === AccountType.ASSET ||
              candidate.type === AccountType.LIABILITY) &&
              currentSimpleUnitIdentifier !== null &&
              getSimpleTransactionUnitIdentifier({
                unit: candidate.unit,
                currency: candidate.currency,
                cryptocurrency: candidate.cryptocurrency,
                symbol: candidate.symbol,
                tradeCurrency: candidate.tradeCurrency,
              }) === currentSimpleUnitIdentifier)),
      ),
    [account.id, accounts, currentSimpleUnitIdentifier],
  );

  const simpleTransactionDisabledReason = getSimpleTransactionDisabledReason({
    account,
    currentSimpleUnitIdentifier,
    simpleCounterAccountOptionsLength: simpleCounterAccountOptions.length,
  });

  const currentAccountLabel = useMemo(
    () => createCurrentAccountLabel(account),
    [account],
  );

  const currentAccountOption = useMemo<AccountOption>(
    () => ({
      label: currentAccountLabel,
      value: account.id,
      unit: account.unit as Unit,
      currency: account.currency ?? undefined,
      cryptocurrency: account.cryptocurrency ?? undefined,
      symbol: account.symbol ?? undefined,
      tradeCurrency: account.tradeCurrency ?? undefined,
      type: account.type,
      equityAccountSubtype: account.equityAccountSubtype,
    }),
    [account, currentAccountLabel],
  );

  const editSimpleCounterAccountOptions = useMemo<AccountOption[]>(() => {
    if (!editingSimpleInitialValues) return simpleCounterAccountOptions;

    const selectedCounterAccountId =
      editingSimpleInitialValues.counterAccountId;
    if (
      simpleCounterAccountOptions.some(
        (option) => option.value === selectedCounterAccountId,
      )
    ) {
      return simpleCounterAccountOptions;
    }

    const selectedCounterAccount = allAccountOptions.find(
      (option) => option.value === selectedCounterAccountId,
    );
    if (!selectedCounterAccount) return simpleCounterAccountOptions;

    return [selectedCounterAccount, ...simpleCounterAccountOptions];
  }, [
    allAccountOptions,
    editingSimpleInitialValues,
    simpleCounterAccountOptions,
  ]);

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

  const handleSwitchCreateToSplit = (draft: SimpleTransactionDraftValues) => {
    const normalized = normalizeSimpleDraft({
      draft,
      fallback: {
        date: new Date(),
        description: "",
        counterAccountId: simpleCounterAccountOptions[0]?.value ?? "",
        amount: 1,
        direction: "DEBIT",
      },
    });
    const counterAccount = allAccountOptions.find(
      (option) => option.value === normalized.counterAccountId,
    );
    if (!counterAccount) {
      throw new Error("Counter account was not found.");
    }

    const payload = buildSimpleTransactionValues({
      values: normalized,
      currentAccount: {
        id: currentAccountOption.value,
        unit: currentAccountOption.unit,
        currency: currentAccountOption.currency,
        cryptocurrency: currentAccountOption.cryptocurrency,
        symbol: currentAccountOption.symbol,
        tradeCurrency: currentAccountOption.tradeCurrency,
      },
      counterAccount,
    });

    setCreateSplitInitialValues(
      toCreateSplitInitialValues(payload.description, payload.bookings),
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

    const counterAccount = allAccountOptions.find(
      (option) => option.value === values.counterAccountId,
    );
    if (!counterAccount) {
      throw new Error("Counter account was not found.");
    }

    const payload = buildSimpleTransactionValues({
      values,
      currentAccount: {
        id: currentAccountOption.value,
        unit: currentAccountOption.unit,
        currency: currentAccountOption.currency,
        cryptocurrency: currentAccountOption.cryptocurrency,
        symbol: currentAccountOption.symbol,
        tradeCurrency: currentAccountOption.tradeCurrency,
      },
      counterAccount,
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

    const normalized = normalizeSimpleDraft({
      draft,
      fallback: editingSimpleInitialValues,
    });
    const counterAccount = allAccountOptions.find(
      (option) => option.value === normalized.counterAccountId,
    );
    if (!counterAccount) {
      throw new Error("Counter account was not found.");
    }

    const payload = buildSimpleTransactionValues({
      values: normalized,
      currentAccount: {
        id: currentAccountOption.value,
        unit: currentAccountOption.unit,
        currency: currentAccountOption.currency,
        cryptocurrency: currentAccountOption.cryptocurrency,
        symbol: currentAccountOption.symbol,
        tradeCurrency: currentAccountOption.tradeCurrency,
      },
      counterAccount,
    });

    setEditingTransactionData({
      ...editingTransactionData,
      ...toEditTransactionData(
        editingTransactionData.id,
        payload.description,
        payload.bookings,
      ),
    });
    setEditMode("SPLIT");
  };

  const handleRebookClick = useCallback((nextRebooking: RebookingState) => {
    setRebooking(nextRebooking);
    setRebookModalOpened(true);
  }, []);

  const hasCompleteBookingUnit = useMemo(() => {
    if (!rebooking || rebooking.bookingUnit.unit == null) return false;

    const bookingUnitIdentifier = getBookingUnitIdentifier({
      unit: rebooking.bookingUnit.unit,
      currency: rebooking.bookingUnit.currency,
      cryptocurrency: rebooking.bookingUnit.cryptocurrency,
      symbol: rebooking.bookingUnit.symbol,
      tradeCurrency: rebooking.bookingUnit.tradeCurrency,
    });

    return bookingUnitIdentifier != null;
  }, [rebooking]);

  const rebookTargetAccountOptions = useMemo(() => {
    if (
      !rebooking ||
      rebooking.bookingUnit.unit == null ||
      !hasCompleteBookingUnit
    ) {
      return [];
    }

    const bookingUnit = {
      ...rebooking.bookingUnit,
      unit: rebooking.bookingUnit.unit,
    };

    const eligibleAccountIds = new Set(
      accounts
        .filter(
          (candidate) =>
            candidate.isActive &&
            candidate.id !== account.id &&
            isBookingUnitCompatibleWithAccount(bookingUnit, candidate) &&
            isBookingValueCompatibleWithAccountType(
              rebooking.bookingValue,
              candidate,
            ),
        )
        .map((candidate) => candidate.id),
    );

    return accountOptions
      .filter((option) => eligibleAccountIds.has(option.value))
      .toSorted((a, b) => a.label.localeCompare(b.label))
      .map((option) => ({ value: option.value, label: option.label }));
  }, [account.id, accountOptions, accounts, hasCompleteBookingUnit, rebooking]);

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
