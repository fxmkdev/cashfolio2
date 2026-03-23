import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import {
  Badge,
  Breadcrumbs,
  Button,
  Container,
  Group,
  Modal,
  Text,
  Tooltip,
} from "@mantine/core";
import { ConfirmDeleteModal } from "../../components/confirm-delete-modal";
import { getAccountsBreadcrumbSegments } from "../../components/accounts-breadcrumb-segments";
import {
  getBookingUnitIdentifier,
  getTypeLabel,
  isBookingValueCompatibleWithAccountType,
  isBookingUnitCompatibleWithAccount,
} from "../../shared/account-utils";
import {
  getBookingUnitFields,
  type BookingUnitFieldsSource,
} from "../../shared/booking-unit-fields";
import { useTransactionScroll } from "../../hooks/use-transaction-scroll";
import { IconBolt } from "@tabler/icons-react";
import { DataGrid } from "../../components/data-grid";
import {
  createSimpleTransaction,
  createTransaction,
  deleteTransaction,
  getTransaction,
  rebookBooking,
  updateTransaction,
} from "../../server/transactions";
import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../../.prisma-client/enums";
import {
  EditTransactionModal,
  type AccountOption,
  type BookingValues,
} from "../../components/edit-transaction-modal";
import {
  SimpleTransactionModal,
  type SimpleTransactionDirection,
  type SimpleTransactionDraftValues,
} from "../../components/simple-transaction-modal";
import { RebookBookingModal } from "../../components/rebook-booking-modal";
import { loadLedgerPageData } from "./ledger-page-loader";
import { useLedgerColumnDefs } from "./ledger-page-columns";
import {
  buildLedgerRows,
  createAccountOptions,
  createCurrentAccountLabel,
  deriveSimpleTransactionEditState,
  getSimpleTransactionDisabledReason,
  getSimpleTransactionUnitIdentifier,
  type SimpleTransactionEditInitialValues,
  getUnitLabel,
} from "./ledger-page-data";
import { parseLedgerSearch } from "./ledger-page-types";

type TransactionBookingInput = {
  date: string;
  accountId: string;
  description: string;
  unit: Unit;
  currency?: string;
  cryptocurrency?: string;
  symbol?: string;
  tradeCurrency?: string;
  value: number;
};

type TransactionMutationValues = {
  description: string;
  bookings: TransactionBookingInput[];
};

type SplitModalInitialValues = {
  description?: string;
  bookings?: Omit<BookingValues, "key">[];
};

type SimpleTransactionValues = {
  date: string;
  description: string;
  counterAccountId: string;
  amount: number;
  direction: SimpleTransactionDirection;
};

type EditMode = "SIMPLE" | "SPLIT";

function buildSimpleTransactionValues(args: {
  values: SimpleTransactionValues;
  currentAccount: { id: string } & BookingUnitFieldsSource;
  counterAccount: AccountOption;
}): TransactionMutationValues {
  const currentUnitFields = getBookingUnitFields(
    args.currentAccount,
    "current account",
  );
  const counterUnitFields =
    args.counterAccount.type === AccountType.EQUITY
      ? currentUnitFields
      : getBookingUnitFields(args.counterAccount, "counter account");

  const currentValue =
    args.values.direction === "DEBIT"
      ? args.values.amount
      : -args.values.amount;

  return {
    description: args.values.description,
    bookings: [
      {
        date: args.values.date,
        accountId: args.currentAccount.id,
        description: "",
        ...currentUnitFields,
        value: currentValue,
      },
      {
        date: args.values.date,
        accountId: args.values.counterAccountId,
        description: "",
        ...counterUnitFields,
        value: -currentValue,
      },
    ],
  };
}

function normalizeSimpleDraft(args: {
  draft: SimpleTransactionDraftValues;
  fallback: SimpleTransactionEditInitialValues;
}): SimpleTransactionValues {
  const amount = Number(args.draft.amount);
  const nextAmount =
    Number.isFinite(amount) && amount > 0 ? amount : args.fallback.amount;

  const date =
    args.draft.date && !isNaN(args.draft.date.getTime())
      ? args.draft.date
      : args.fallback.date;

  return {
    date: date.toISOString(),
    description: args.draft.description,
    counterAccountId:
      args.draft.counterAccountId || args.fallback.counterAccountId,
    amount: nextAmount,
    direction: args.draft.direction ?? args.fallback.direction,
  };
}

function toEditTransactionData(
  id: string,
  description: string,
  bookings: TransactionBookingInput[],
): Awaited<ReturnType<typeof getTransaction>> {
  const splitBookings = bookings.map((booking) => ({
    date: booking.date,
    account: booking.accountId,
    description: booking.description,
    unit: booking.unit,
    currency: booking.currency,
    cryptocurrency: booking.cryptocurrency,
    symbol: booking.symbol,
    tradeCurrency: booking.tradeCurrency,
    debit: booking.value > 0 ? booking.value : undefined,
    credit: booking.value < 0 ? -booking.value : undefined,
  }));

  return {
    id,
    description,
    bookings: splitBookings,
  };
}

function toCreateSplitInitialValues(
  description: string,
  bookings: TransactionBookingInput[],
): SplitModalInitialValues {
  return {
    description,
    bookings: bookings.map((booking) => ({
      date: booking.date,
      account: booking.accountId,
      description: booking.description,
      unit: booking.unit,
      currency: booking.currency,
      cryptocurrency: booking.cryptocurrency,
      symbol: booking.symbol,
      tradeCurrency: booking.tradeCurrency,
      debit: booking.value > 0 ? booking.value : undefined,
      credit: booking.value < 0 ? -booking.value : undefined,
    })),
  };
}

export const Route = createFileRoute("/$accountBookId/$accountId")({
  validateSearch: parseLedgerSearch,
  loader: async ({ params: { accountBookId, accountId } }) => {
    return loadLedgerPageData({ accountBookId, accountId });
  },
  component: LedgerPage,
});

function LedgerPage() {
  const { account, bookings, accounts } = Route.useLoaderData();
  const { accountBookId } = Route.useParams();
  const { transactionId } = Route.useSearch();
  const [modalOpened, setModalOpened] = useState(false);
  const [simpleModalOpened, setSimpleModalOpened] = useState(false);
  const [editModalOpened, setEditModalOpened] = useState(false);
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
  const [rebooking, setRebooking] = useState<
    | {
        bookingId: string;
        transactionId: string;
        bookingValue: number;
        bookingUnit: {
          unit: Unit | null;
          currency: string | null;
          cryptocurrency: string | null;
          symbol: string | null;
          tradeCurrency: string | null;
        };
      }
    | undefined
  >();
  const [rebookModalOpened, setRebookModalOpened] = useState(false);
  const router = useRouter();

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

  async function handleCreateTransaction(values: TransactionMutationValues) {
    const transaction = await createTransaction({
      data: { accountBookId, ...values },
    });
    setModalOpened(false);
    setCreateSplitInitialValues(undefined);
    pendingScrollRef.current = transaction.id;
    router.invalidate();
  }

  async function handleCreateSimpleTransaction(
    values: SimpleTransactionValues,
  ) {
    const transaction = await createSimpleTransaction({
      data: {
        accountBookId,
        accountId: account.id,
        ...values,
      },
    });
    setSimpleModalOpened(false);
    pendingScrollRef.current = transaction.id;
    router.invalidate();
  }

  function handleSwitchCreateToSplit(draft: SimpleTransactionDraftValues) {
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
  }

  const handleEditClick = useCallback(
    async function handleEditClick(transactionId: string) {
      const data = await getTransaction({
        data: { transactionId, accountBookId },
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
    [account.id, accountBookId, simpleTransactionDisabledReason],
  );

  async function handleUpdateTransaction(values: TransactionMutationValues) {
    await updateTransaction({
      data: {
        accountBookId,
        transactionId: editingTransactionId!,
        ...values,
      },
    });
    setEditModalOpened(false);
    pendingScrollRef.current = editingTransactionId;
    router.invalidate();
  }

  async function handleUpdateSimpleTransaction(
    values: SimpleTransactionValues,
  ) {
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

    await updateTransaction({
      data: {
        accountBookId,
        transactionId: editingTransactionId!,
        ...payload,
      },
    });

    setEditModalOpened(false);
    pendingScrollRef.current = editingTransactionId;
    router.invalidate();
  }

  function handleSwitchToSplit(draft: SimpleTransactionDraftValues) {
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
  }

  async function handleDeleteTransaction() {
    if (!deletingTransaction) return;
    await deleteTransaction({
      data: {
        transactionId: deletingTransaction.id,
        accountBookId,
      },
    });
    setDeletingTransaction(undefined);
    router.invalidate();
  }

  const handleRebookClick = useCallback(
    (args: {
      bookingId: string;
      transactionId: string;
      bookingValue: number;
      bookingUnit: {
        unit: Unit | null;
        currency: string | null;
        cryptocurrency: string | null;
        symbol: string | null;
        tradeCurrency: string | null;
      };
    }) => {
      setRebooking(args);
      setRebookModalOpened(true);
    },
    [],
  );

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

  async function handleRebookBooking(values: { targetAccountId: string }) {
    if (!rebooking) return;

    await rebookBooking({
      data: {
        accountBookId,
        bookingId: rebooking.bookingId,
        targetAccountId: values.targetAccountId,
      },
    });

    setRebookModalOpened(false);
    pendingScrollRef.current = rebooking.transactionId;
    router.invalidate();
  }

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
    accountBookId,
    isEquity,
    isIncome,
    isExpense,
    onEditClick: handleEditClick,
    onRebookClick: handleRebookClick,
    onDeleteClick: handleDeleteClick,
  });

  const navigate = Route.useNavigate();
  const { pendingScrollRef, handleRowDataUpdated } = useTransactionScroll(
    transactionId,
    navigate,
  );

  const unitLabel = getUnitLabel(account);

  const backTab = (
    account.type === AccountType.EQUITY && account.equityAccountSubtype
      ? `EQUITY-${account.equityAccountSubtype}`
      : account.type
  ) as "ASSET" | "LIABILITY" | `EQUITY-${EquityAccountSubtype}`;

  return (
    <Container fluid py="xl" px="xl">
      <Group mb="lg" gap="md" justify="space-between">
        <Group gap="md">
          <Breadcrumbs fz="h2" fw={700}>
            {getAccountsBreadcrumbSegments({
              accountBookId,
              tab: backTab,
              mode: account.isActive ? "active" : "archived",
            })}
            <Text fz="inherit" fw="inherit">
              {getTypeLabel(account.type, account.equityAccountSubtype)}
            </Text>
            {account.groupPathSegments.map((segment) => (
              <Text key={segment} fz="inherit" fw="inherit">
                {segment}
              </Text>
            ))}
            <Text fz="inherit" fw="inherit">
              {account.name}
            </Text>
          </Breadcrumbs>
          {unitLabel && (
            <Badge size="lg" color="gray">
              {unitLabel}
            </Badge>
          )}
        </Group>
        <Group gap="sm">
          <Tooltip
            label={
              simpleTransactionDisabledReason
                ? `${simpleTransactionDisabledReason} Split editor will open instead.`
                : "Quick two-booking entry"
            }
          >
            <span>
              <Button
                leftSection={<IconBolt size={16} />}
                onClick={() => {
                  setCreateSplitInitialValues(undefined);
                  if (simpleTransactionDisabledReason) {
                    setModalOpened(true);
                    return;
                  }
                  setSimpleModalOpened(true);
                }}
              >
                Add Transaction
              </Button>
            </span>
          </Tooltip>
        </Group>
      </Group>

      <DataGrid
        containerStyle={{ height: "calc(100vh - 8rem)" }}
        rowData={rows}
        columnDefs={columnDefs}
        defaultColDef={{
          sortable: false,
          suppressHeaderMenuButton: true,
        }}
        getRowId={({ data }) => data.id}
        onRowDataUpdated={handleRowDataUpdated}
      />

      <Modal
        opened={simpleModalOpened}
        onClose={() => setSimpleModalOpened(false)}
        title="Add Transaction"
        size="xl"
      >
        <SimpleTransactionModal
          currentAccount={{ id: account.id, label: currentAccountLabel }}
          accounts={simpleCounterAccountOptions}
          onSwitchToSplit={handleSwitchCreateToSplit}
          onClose={() => setSimpleModalOpened(false)}
          onSubmit={handleCreateSimpleTransaction}
        />
      </Modal>

      <Modal
        opened={modalOpened}
        onClose={() => {
          setModalOpened(false);
          setCreateSplitInitialValues(undefined);
        }}
        title="Add Transaction"
        size="100%"
      >
        <EditTransactionModal
          initialValues={createSplitInitialValues}
          submitLabel="Create"
          accounts={accountOptions}
          currentAccountId={account.id}
          onClose={() => {
            setModalOpened(false);
            setCreateSplitInitialValues(undefined);
          }}
          onSubmit={handleCreateTransaction}
        />
      </Modal>

      <Modal
        opened={editModalOpened}
        onClose={() => setEditModalOpened(false)}
        title="Edit Transaction"
        size={editMode === "SIMPLE" ? "xl" : "100%"}
        onExitTransitionEnd={() => {
          setEditingTransactionId(undefined);
          setEditingTransactionData(undefined);
          setEditingSimpleInitialValues(undefined);
          setEditMode("SPLIT");
        }}
      >
        {editingTransactionData &&
        editMode === "SIMPLE" &&
        editingSimpleInitialValues ? (
          <SimpleTransactionModal
            currentAccount={{ id: account.id, label: currentAccountLabel }}
            accounts={editSimpleCounterAccountOptions}
            initialValues={editingSimpleInitialValues}
            submitLabel="Save"
            onSwitchToSplit={handleSwitchToSplit}
            onClose={() => setEditModalOpened(false)}
            onSubmit={handleUpdateSimpleTransaction}
          />
        ) : editingTransactionData ? (
          <EditTransactionModal
            initialValues={editingTransactionData}
            accounts={editAccountOptions}
            currentAccountId={account.id}
            onClose={() => setEditModalOpened(false)}
            onSubmit={handleUpdateTransaction}
          />
        ) : null}
      </Modal>

      <Modal
        opened={rebookModalOpened}
        onClose={() => setRebookModalOpened(false)}
        title="Rebook Booking"
        size="md"
        onExitTransitionEnd={() => {
          setRebooking(undefined);
        }}
      >
        {rebooking && (
          <RebookBookingModal
            targetAccounts={rebookTargetAccountOptions}
            disabledReason={
              !hasCompleteBookingUnit
                ? "This booking has incomplete unit data and cannot be rebooked."
                : undefined
            }
            onClose={() => setRebookModalOpened(false)}
            onSubmit={handleRebookBooking}
          />
        )}
      </Modal>

      <ConfirmDeleteModal
        opened={!!deletingTransaction}
        onClose={() => setDeletingTransaction(undefined)}
        title="Delete Transaction"
        name={deletingTransaction?.description}
        onConfirm={handleDeleteTransaction}
      />
    </Container>
  );
}
