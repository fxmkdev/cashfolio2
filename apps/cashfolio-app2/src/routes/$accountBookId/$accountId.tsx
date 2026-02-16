import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActionIcon,
  Anchor,
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
import { getTypeLabel } from "../../shared/account-utils";
import { useTransactionScroll } from "../../hooks/use-transaction-scroll";
import { IconCashPlus, IconPencil, IconTrash } from "@tabler/icons-react";
import type { ColDef, ICellRendererParams } from "ag-grid-enterprise";
import { DataGrid } from "../../components/data-grid";
import { getAccountForLedger, getLedgerData } from "../../server/ledger";
import { getAccounts } from "../../server/accounts";
import {
  createTransaction,
  deleteTransaction,
  getTransaction,
  updateTransaction,
} from "../../server/transactions";
import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../../.prisma-client/enums";
import { FORMATTED_NUMERIC_COLUMN } from "../../components/column-types";
import { format } from "date-fns";
import {
  EditTransactionModal,
  type AccountOption,
} from "../../components/edit-transaction-modal";

export const Route = createFileRoute("/$accountBookId/$accountId")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { transactionId?: string } => ({
    transactionId:
      typeof search.transactionId === "string"
        ? search.transactionId
        : undefined,
  }),
  loader: async ({ params: { accountBookId, accountId } }) => {
    const [account, bookings, accounts] = await Promise.all([
      getAccountForLedger({ data: { accountId, accountBookId } }),
      getLedgerData({ data: { accountId, accountBookId } }),
      getAccounts({ data: { accountBookId } }),
    ]);
    return { account, bookings, accounts };
  },
  component: LedgerPage,
});

function shouldNegate(
  type: AccountType,
  equityAccountSubtype: EquityAccountSubtype | null,
): boolean {
  return (
    type === AccountType.LIABILITY ||
    (type === AccountType.EQUITY &&
      equityAccountSubtype !== EquityAccountSubtype.EXPENSE)
  );
}

function getUnitLabel(account: {
  unit: Unit | null;
  currency: string | null;
  cryptocurrency: string | null;
  tradeCurrency: string | null;
}): string | null {
  if (!account.unit) return null;
  switch (account.unit) {
    case Unit.CURRENCY:
      return account.currency;
    case Unit.SECURITY:
      return account.tradeCurrency;
    case Unit.CRYPTOCURRENCY:
      return account.cryptocurrency;
  }
}

type LedgerRow = {
  id: string;
  transactionId: string;
  date: string;
  counterpartyAccounts: { id: string; name: string }[];
  description: string;
  unit: Unit | null;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  debit: number | null;
  credit: number | null;
  balance: number | null;
};

type LedgerAccountOptionSource = Awaited<ReturnType<typeof getAccounts>>[number];

function toAccountOption(account: LedgerAccountOptionSource): AccountOption {
  return {
    label: [getTypeLabel(account.type, account.equityAccountSubtype), account.groupPath, account.name]
      .filter(Boolean)
      .join(" / "),
    value: account.id,
    unit: account.unit as Unit,
    currency: account.currency,
    cryptocurrency: account.cryptocurrency,
    symbol: account.symbol,
    tradeCurrency: account.tradeCurrency,
    type: account.type as AccountType,
    equityAccountSubtype:
      account.equityAccountSubtype as EquityAccountSubtype | null,
  };
}

function createAccountOptions(
  accounts: LedgerAccountOptionSource[],
  includeAccount: (account: LedgerAccountOptionSource) => boolean,
): AccountOption[] {
  return accounts.filter(includeAccount).map(toAccountOption);
}

function LedgerPage() {
  const { account, bookings, accounts } = Route.useLoaderData();
  const { accountBookId } = Route.useParams();
  const { transactionId } = Route.useSearch();
  const [modalOpened, setModalOpened] = useState(false);
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
  const router = useRouter();

  const accountOptions = useMemo<AccountOption[]>(
    () => createAccountOptions(accounts, (a) => a.isActive),
    [accounts],
  );

  const editAccountOptions = useMemo<AccountOption[]>(
    () => {
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
    },
    [account.id, accountOptions, accounts, editingTransactionData],
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

  const isEquity = account.type === AccountType.EQUITY;
  const isIncome =
    account.type === AccountType.EQUITY &&
    account.equityAccountSubtype === EquityAccountSubtype.INCOME;
  const isExpense =
    account.type === AccountType.EQUITY &&
    account.equityAccountSubtype === EquityAccountSubtype.EXPENSE;

  const rows = useMemo<LedgerRow[]>(() => {
    const negate = shouldNegate(account.type, account.equityAccountSubtype);
    let balance = 0;

    return bookings
      .map((b) => {
        const rawValue = Number(b.value);
        const value = negate ? -rawValue : rawValue;
        balance += value;

        return {
          id: b.id,
          transactionId: b.transactionId,
          date: format(new Date(b.date), "dd.MM.yyyy"),
          counterpartyAccounts: b.counterpartyAccounts,
          description: b.description || b.transactionDescription,
          unit: b.unit,
          currency: b.currency,
          cryptocurrency: b.cryptocurrency,
          symbol: b.symbol,
          debit: negate
            ? value < 0
              ? -value
              : null
            : value > 0
              ? value
              : null,
          credit: negate
            ? value > 0
              ? value
              : null
            : value < 0
              ? -value
              : null,
          balance: isEquity ? null : balance,
        };
      })
      .reverse();
  }, [account, bookings, isEquity]);

  const columnDefs = useMemo<ColDef<LedgerRow>[]>(
    () => [
      {
        field: "date",
        headerName: "Date",
        width: 130,
      },
      {
        field: "counterpartyAccounts",
        headerName: "Account(s)",
        flex: 1,
        cellRenderer: ({
          value,
          data,
        }: ICellRendererParams<
          LedgerRow,
          LedgerRow["counterpartyAccounts"]
        >) => {
          if (!value || !data) return null;
          return value.map((a, i) => (
            <span key={a.id}>
              {i > 0 && ", "}
              <Link
                to="/$accountBookId/$accountId"
                params={{ accountBookId, accountId: a.id }}
                search={{ transactionId: data.transactionId }}
                style={{ textDecoration: "none" }}
              >
                <Anchor component="span" size="sm">
                  {a.name}
                </Anchor>
              </Link>
            </span>
          ));
        },
      },
      {
        field: "description",
        headerName: "Description",
        width: 400,
        filter: "agTextColumnFilter",
      },
      ...(isEquity
        ? [
            {
              colId: "unitIdentifier",
              headerName: "Ccy./Symbol",
              width: 130,
              filter: true,
              valueGetter: ({ data }: { data?: LedgerRow }) => {
                if (!data) return null;
                switch (data.unit) {
                  case Unit.CURRENCY:
                    return data.currency;
                  case Unit.CRYPTOCURRENCY:
                    return data.cryptocurrency;
                  case Unit.SECURITY:
                    return data.symbol;
                  default:
                    return null;
                }
              },
            },
          ]
        : []),
      ...(isIncome
        ? []
        : [
            {
              field: "debit" as const,
              headerName: "Debit",
              width: 130,
              type: FORMATTED_NUMERIC_COLUMN,
              filter: "agNumberColumnFilter",
            },
          ]),
      ...(isExpense
        ? []
        : [
            {
              field: "credit" as const,
              headerName: "Credit",
              width: 130,
              type: FORMATTED_NUMERIC_COLUMN,
              filter: "agNumberColumnFilter",
            },
          ]),
      ...(isEquity
        ? []
        : [
            {
              field: "balance" as const,
              headerName: "Balance",
              width: 130,
              type: FORMATTED_NUMERIC_COLUMN,
              filter: "agNumberColumnFilter",
            },
          ]),
      {
        colId: "actions",
        headerName: "",
        width: 80,
        sortable: false,
        filter: false,
        resizable: false,
        suppressHeaderMenuButton: true,
        cellClass: "actions-cell",
        cellRenderer: ({ data }: ICellRendererParams<LedgerRow>) => {
          if (!data) return null;
          return (
            <Group gap={4} wrap="nowrap" h="100%" align="center">
              <Tooltip label="Edit">
                <ActionIcon
                  variant="subtle"
                  size="sm"
                  onClick={() => handleEditClick(data.transactionId)}
                  aria-label="Edit"
                >
                  <IconPencil size={16} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Delete">
                <ActionIcon
                  variant="subtle"
                  size="sm"
                  color="red"
                  onClick={() =>
                    setDeletingTransaction({
                      id: data.transactionId,
                      description: data.description,
                    })
                  }
                  aria-label="Delete"
                >
                  <IconTrash size={16} />
                </ActionIcon>
              </Tooltip>
            </Group>
          );
        },
      },
    ],
    [accountBookId, handleEditClick, isEquity, isIncome, isExpense],
  );

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
            <Anchor
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              {...({
                component: Link,
                to: "/$accountBookId",
                params: { accountBookId },
                search: { tab: backTab },
              } as any)}
              fz="inherit"
              fw="inherit"
            >
              {getTypeLabel(account.type, account.equityAccountSubtype)}
            </Anchor>
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
        <Button
          leftSection={<IconCashPlus size={16} />}
          onClick={() => setModalOpened(true)}
        >
          Add Transaction
        </Button>
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
