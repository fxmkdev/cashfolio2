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
import { useTransactionScroll } from "../../hooks/use-transaction-scroll";
import { IconBolt, IconCashPlus } from "@tabler/icons-react";
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
} from "../../components/edit-transaction-modal";
import { SimpleTransactionModal } from "../../components/simple-transaction-modal";
import { RebookBookingModal } from "../../components/rebook-booking-modal";
import { loadLedgerPageData } from "./ledger-page-loader";
import { useLedgerColumnDefs } from "./ledger-page-columns";
import {
  buildLedgerRows,
  createAccountOptions,
  createCurrentAccountLabel,
  getSimpleTransactionDisabledReason,
  getSimpleTransactionUnitIdentifier,
  getUnitLabel,
} from "./ledger-page-data";
import { parseLedgerSearch } from "./ledger-page-types";

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
  const [editingTransactionId, setEditingTransactionId] = useState<
    string | undefined
  >();
  const [editingTransactionData, setEditingTransactionData] = useState<
    Awaited<ReturnType<typeof getTransaction>> | undefined
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
  const currentAccountLabel = useMemo(
    () => createCurrentAccountLabel(account),
    [account],
  );

  async function handleCreateTransaction(values: {
    description: string;
    bookings: {
      date: string;
      accountId: string;
      description: string;
      unit: Unit;
      currency?: string;
      cryptocurrency?: string;
      symbol?: string;
      tradeCurrency?: string;
      value: number;
    }[];
  }) {
    const transaction = await createTransaction({
      data: { accountBookId, ...values },
    });
    setModalOpened(false);
    pendingScrollRef.current = transaction.id;
    router.invalidate();
  }

  async function handleCreateSimpleTransaction(values: {
    date: string;
    description: string;
    counterAccountId: string;
    amount: number;
    direction: "DEBIT" | "CREDIT";
  }) {
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

  const handleEditClick = useCallback(
    async function handleEditClick(transactionId: string) {
      const data = await getTransaction({
        data: { transactionId, accountBookId },
      });
      setEditingTransactionId(transactionId);
      setEditingTransactionData(data);
      setEditModalOpened(true);
    },
    [accountBookId],
  );

  async function handleUpdateTransaction(values: {
    description: string;
    bookings: {
      date: string;
      accountId: string;
      description: string;
      unit: Unit;
      currency?: string;
      cryptocurrency?: string;
      symbol?: string;
      tradeCurrency?: string;
      value: number;
    }[];
  }) {
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

  const rebookingUnitIdentifier = useMemo(() => {
    if (!rebooking || rebooking.bookingUnit.unit == null) return null;

    return getBookingUnitIdentifier({
      unit: rebooking.bookingUnit.unit,
      currency: rebooking.bookingUnit.currency,
      cryptocurrency: rebooking.bookingUnit.cryptocurrency,
      symbol: rebooking.bookingUnit.symbol,
      tradeCurrency: rebooking.bookingUnit.tradeCurrency,
    });
  }, [rebooking]);

  const rebookTargetAccountOptions = useMemo(() => {
    if (
      !rebooking ||
      rebooking.bookingUnit.unit == null ||
      rebookingUnitIdentifier == null
    ) {
      return [];
    }

    const bookingUnit = {
      ...rebooking.bookingUnit,
      unit: rebooking.bookingUnit.unit,
    };

    return accounts
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
      .toSorted((a, b) =>
        `${a.groupPath} / ${a.name}`.localeCompare(
          `${b.groupPath} / ${b.name}`,
        ),
      )
      .map((candidate) => ({
        value: candidate.id,
        label: [candidate.groupPath, candidate.name]
          .filter(Boolean)
          .join(" / "),
      }));
  }, [account.id, accounts, rebooking, rebookingUnitIdentifier]);

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
  const simpleTransactionDisabledReason = getSimpleTransactionDisabledReason({
    account,
    currentSimpleUnitIdentifier,
    simpleCounterAccountOptionsLength: simpleCounterAccountOptions.length,
  });

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
            label={simpleTransactionDisabledReason ?? "Quick two-booking entry"}
          >
            <span>
              <Button
                leftSection={<IconBolt size={16} />}
                onClick={() => setSimpleModalOpened(true)}
                disabled={!!simpleTransactionDisabledReason}
              >
                Add Simple Transaction
              </Button>
            </span>
          </Tooltip>
          <Button
            leftSection={<IconCashPlus size={16} />}
            variant="default"
            onClick={() => setModalOpened(true)}
          >
            Add Split Transaction
          </Button>
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
        title="Add Simple Transaction"
        size="xl"
      >
        <SimpleTransactionModal
          currentAccount={{ id: account.id, label: currentAccountLabel }}
          accounts={simpleCounterAccountOptions}
          onClose={() => setSimpleModalOpened(false)}
          onSubmit={handleCreateSimpleTransaction}
        />
      </Modal>

      <Modal
        opened={modalOpened}
        onClose={() => setModalOpened(false)}
        title="Add Transaction"
        size="100%"
      >
        <EditTransactionModal
          accounts={accountOptions}
          currentAccountId={account.id}
          onClose={() => setModalOpened(false)}
          onSubmit={handleCreateTransaction}
        />
      </Modal>

      <Modal
        opened={editModalOpened}
        onClose={() => setEditModalOpened(false)}
        title="Edit Transaction"
        size="100%"
        onExitTransitionEnd={() => {
          setEditingTransactionId(undefined);
          setEditingTransactionData(undefined);
        }}
      >
        {editingTransactionData && (
          <EditTransactionModal
            initialValues={editingTransactionData}
            accounts={editAccountOptions}
            currentAccountId={account.id}
            onClose={() => setEditModalOpened(false)}
            onSubmit={handleUpdateTransaction}
          />
        )}
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
              rebookingUnitIdentifier == null
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
