import { useTransactionWorkflow } from "./use-transaction-workflow";
import { useRefreshAssetClasses } from "@/classification-context";
import {
  getAccountConstraintMessage,
  getAccountManagementContext,
} from "@/shared/accounts/account-presentation";
import { useRefreshedMutationData } from "@/hooks/use-refreshed-mutation-data";
import { useUnarchiveMutation } from "@/hooks/use-unarchive-mutation";
import { deleteTransactions, rebookBookings } from "@/server/transactions";
import { useBulkTransactionActions } from "@/hooks/use-bulk-transaction-actions";
import { useCallback, useMemo, useState } from "react";
import { AccountType, EquityAccountSubtype } from "@/.prisma-client/enums";
import {
  createAccountInitialValues,
  type TransformedFormValues,
} from "@/components/account-editor/edit-account-modal";
import type { SimpleTransactionDraftValues } from "@/components/transactions/simple-transaction-modal";
import { createAccountBookUnitUsage } from "@/shared/accounts/account-book-unit-usage";
import {
  getSystemManagedAccountSubtypeMessage,
  isSystemManagedEquitySubtype,
} from "@/shared/accounts/system-managed-equity-subtypes";
import { useLedgerColumnDefs } from "./page-columns";
import { useLedgerAccountOptions } from "./page-account-options";
import { getUnitLabel } from "./page-data";
import { createUpdateTransactionPayloadFromSimpleValues } from "./page-edit-flow";
import { loadLedgerPageData } from "./page-loader";
import {
  createLedgerAccountMutationActions,
  createLedgerMutationActions,
} from "./page-mutation-actions";
import { useLedgerRebookFlow } from "./page-rebook-flow";
import { getStatementImportDisabledReason } from "../-statement-import";
import {
  type LedgerPageViewProps,
  type RebookingState,
  type SimpleTransactionValues,
} from "./page-view.types";

type LedgerPageLoaderData = Awaited<ReturnType<typeof loadLedgerPageData>>;

export function useLedgerPageController(args: {
  loaderData: LedgerPageLoaderData;
  accountBookId: string;
  hasPeriodFilter: boolean;
  selectedPeriodValue?: string;
  setPeriodFilter: (nextPeriodValue: string | undefined) => void;
  pendingScrollRef: { current: string | undefined };
  invalidate: () => void;
  onAccountDeleted: (args: {
    tab: LedgerPageViewProps["backTab"];
    mode: "active" | "archived";
  }) => void | Promise<void>;
  onOpenImportPage: () => void;
}): Omit<LedgerPageViewProps, "onRowDataUpdated"> {
  const refreshAssetClasses = useRefreshAssetClasses();
  const { data: loaderData, refresh: refreshPageConstraints } =
    useRefreshedMutationData(args.loaderData, () =>
      loadLedgerPageData({
        accountBookId: args.accountBookId,
        accountId: args.loaderData.account.id,
        period: args.selectedPeriodValue,
      }),
    );
  const onRefreshConstraints = useCallback(async () => {
    await Promise.all([refreshPageConstraints(), refreshAssetClasses()]);
  }, [refreshPageConstraints, refreshAssetClasses]);
  const { account, accounts, accountGroups, accountTreeRow, existingNodes } =
    loaderData;
  const unitUsage = useMemo(
    () =>
      createAccountBookUnitUsage({
        referenceCurrency: loaderData.referenceCurrency,
        accounts,
      }),
    [accounts, loaderData.referenceCurrency],
  );

  const [accountEditModalOpened, setAccountEditModalOpened] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [archivingAccount, setArchivingAccount] = useState(false);
  const workflow = useTransactionWorkflow(
    `${args.accountBookId}:${account.id}`,
    account.id,
  );
  const {
    editingTransactionId,
    editingTransactionData,
    editingSimpleInitialValues,
    createSplitInitialValues,
    createSimpleInitialValues,
  } = workflow;
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
    editingTransactionData: editingTransactionData ?? createSplitInitialValues,
    editingSimpleInitialValues:
      editingSimpleInitialValues ?? createSimpleInitialValues,
  });

  const bulkActions = useBulkTransactionActions({
    scopeKey: `${args.accountBookId}:${account.id}:${args.selectedPeriodValue ?? ""}`,
    rows: loaderData.rows,
    invalidate: args.invalidate,
    onRefreshConstraints,
    deleteTransactions: (transactionIds) =>
      deleteTransactions({
        data: { accountBookId: args.accountBookId, transactionIds },
      }),
    rebook: {
      submit: (bookingIds, targetAccountId) =>
        rebookBookings({
          data: {
            accountBookId: args.accountBookId,
            bookingIds,
            targetAccountId,
          },
        }),
      currentAccountId: account.id,
      accountOptions,
      getBooking: (row) => row,
    },
  });

  const actions = createLedgerMutationActions({
    accountBookId: args.accountBookId,
    accountId: account.id,
    selectedPeriodValue: args.selectedPeriodValue,
    setPeriodFilter: args.setPeriodFilter,
    invalidate: args.invalidate,
    pendingScrollRef: args.pendingScrollRef,
    state: {
      getEditingTransactionId: () => editingTransactionId,
      getDeletingTransaction: () => deletingTransaction,
      getRebooking: () => rebooking,
      closeSplitCreate: workflow.close,
      closeSimpleCreate: workflow.close,
      closeEdit: workflow.close,
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

  const handleSwitchCreateToSplit = (draft: SimpleTransactionDraftValues) =>
    workflow.switchCreateToSplit(draft, {
      allAccountOptions,
      currentAccount: currentAccountForSimpleTransaction,
    });
  const handleEditClick = (transactionId: string) =>
    workflow.loadTransaction(
      "edit",
      () =>
        actions.getTransaction({
          data: { transactionId, accountBookId: args.accountBookId },
        }),
      simpleTransactionDisabledReason === null,
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

    workflow.close();
    args.pendingScrollRef.current = editingId;
    args.invalidate();
  };

  const handleSwitchToSplit = (draft: SimpleTransactionDraftValues) =>
    workflow.switchEditToSplit(draft, {
      allAccountOptions,
      currentAccount: currentAccountForSimpleTransaction,
    });

  const handleRebookClick = useCallback((nextRebooking: RebookingState) => {
    setRebooking(nextRebooking);
    setRebookModalOpened(true);
  }, []);

  const handleCopyClick = (transactionId: string) =>
    workflow.loadTransaction(
      "copy",
      () =>
        actions.getTransaction({
          data: { transactionId, accountBookId: args.accountBookId },
        }),
      simpleTransactionDisabledReason === null,
    );

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
  const isOpeningBalances =
    account.type === AccountType.EQUITY &&
    account.equityAccountSubtype === EquityAccountSubtype.OPENING_BALANCES;

  const handleDeleteClick = useCallback(
    (transactionId: string, description: string) => {
      setDeletingTransaction({ id: transactionId, description });
    },
    [],
  );

  const rows = loaderData.rows;

  const columnDefs = useLedgerColumnDefs({
    accountBookId: args.accountBookId,
    hasPeriodFilter: args.hasPeriodFilter,
    selectedPeriodValue: args.selectedPeriodValue,
    referenceCurrency: loaderData.referenceCurrency,
    isEquity,
    isOpeningBalances,
    isIncome,
    isExpense,
    onEditClick: handleEditClick,
    onRebookClick: handleRebookClick,
    onCopyClick: handleCopyClick,
    onDeleteClick: handleDeleteClick,
  });

  const unitLabel = getUnitLabel(account);
  const statementImportDisabledReason =
    getStatementImportDisabledReason(account);
  const accountBookStartDate = new Date(loaderData.periodBounds.minBookingDate);

  const backTab = (
    account.type === AccountType.EQUITY && account.equityAccountSubtype
      ? `EQUITY-${account.equityAccountSubtype}`
      : account.type
  ) as "BALANCE" | `EQUITY-${EquityAccountSubtype}`;
  const accountActions = createLedgerAccountMutationActions({
    accountBookId: args.accountBookId,
    accountId: account.id,
    invalidate: args.invalidate,
    onAccountDeleted: () =>
      args.onAccountDeleted({
        tab: backTab,
        mode: account.isActive ? "active" : "archived",
      }),
    state: {
      setAccountEditModalOpened,
      setDeletingAccount,
      setArchivingAccount,
    },
  });
  const systemManagedAccountDisabledReason = isSystemManagedEquitySubtype(
    account.equityAccountSubtype,
  )
    ? getSystemManagedAccountSubtypeMessage(account.equityAccountSubtype)
    : undefined;
  const accountEditInitialValues = useMemo(
    () => createAccountInitialValues(accountTreeRow),
    [accountTreeRow],
  );
  const accountArchiveDisabledReason =
    systemManagedAccountDisabledReason ?? accountTreeRow.archiveDisabledReason;
  const accountUnarchiveDisabledReason =
    systemManagedAccountDisabledReason ??
    accountTreeRow.unarchiveDisabledReason;
  const accountDeleteDisabledReason =
    systemManagedAccountDisabledReason ?? accountTreeRow.deleteDisabledReason;
  const unarchiveRecovery = useUnarchiveMutation({
    scopeKey: `${args.accountBookId}:${account.id}`,
    onUnarchive: accountActions.handleUnarchiveAccount,
    formatErrorMessage: (message) =>
      getAccountConstraintMessage(
        message,
        getAccountManagementContext(account),
      ) ?? message,
    onRefreshConstraints,
    isEligible: (target) =>
      target.id === account.id &&
      !systemManagedAccountDisabledReason &&
      accountTreeRow.unarchivable,
  });

  return {
    onRefreshConstraints,
    unarchiveRecovery,
    bulkActions,
    backTab,
    account,
    accountGroups,
    existingNodes,
    accountEditModalOpened,
    accountEditInitialValues,
    accountEditDisabledReason: systemManagedAccountDisabledReason,
    deletingAccount: deletingAccount
      ? { id: account.id, name: account.name }
      : undefined,
    archivingAccount: archivingAccount
      ? { id: account.id, name: account.name }
      : undefined,
    accountArchivable:
      !systemManagedAccountDisabledReason && accountTreeRow.archivable,
    accountArchiveLabel: accountArchiveDisabledReason ?? "Archive",
    accountUnarchivable:
      !systemManagedAccountDisabledReason && accountTreeRow.unarchivable,
    accountUnarchiveLabel: accountUnarchiveDisabledReason ?? "Unarchive",
    accountDeletable:
      !systemManagedAccountDisabledReason && accountTreeRow.deletable,
    accountDeleteLabel: accountDeleteDisabledReason ?? "Delete",
    rows,
    columnDefs,
    currentAccountLabel,
    unitLabel,
    accountBookStartDate,
    simpleTransactionDisabledReason,
    ...workflow.viewProps,
    isRebookSubmitting,
    deletingTransaction,
    rebooking,
    rebookModalOpened,
    hasCompleteBookingUnit,
    unitUsage,
    accountOptions,
    editAccountOptions,
    simpleCounterAccountOptions,
    editSimpleCounterAccountOptions,
    rebookTargetAccountOptions,
    statementImportDisabledReason,
    onOpenAccountEdit: () => setAccountEditModalOpened(true),
    onCloseAccountEdit: () => setAccountEditModalOpened(false),
    onSubmitUpdateAccount: (values: TransformedFormValues) =>
      accountActions.handleUpdateAccount(values),
    onOpenArchiveAccount: () => setArchivingAccount(true),
    onCloseArchiveAccount: () => setArchivingAccount(false),
    onConfirmArchiveAccount: accountActions.handleArchiveAccount,
    onUnarchiveAccount: () =>
      unarchiveRecovery.unarchive({
        id: account.id,
        name: account.name,
        nodeType: "account",
      }),
    onOpenDeleteAccount: () => setDeletingAccount(true),
    onCloseDeleteAccount: () => setDeletingAccount(false),
    onConfirmDeleteAccount: accountActions.handleDeleteAccount,
    onAddTransactionClick: () =>
      workflow.openCreate(simpleTransactionDisabledReason === null),
    onSwitchCreateToSplit: handleSwitchCreateToSplit,
    onSubmitCreateSimpleTransaction: actions.handleCreateSimpleTransaction,
    onOpenImportPage: args.onOpenImportPage,
    onSubmitCreateTransaction: actions.handleCreateTransaction,
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
