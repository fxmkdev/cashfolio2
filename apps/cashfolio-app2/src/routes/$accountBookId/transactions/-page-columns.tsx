import { useMemo } from "react";
import { ActionIcon, Group, Tooltip } from "@mantine/core";
import {
  IconCopy,
  IconPencil,
  IconSquareArrowRight,
  IconTrash,
} from "@tabler/icons-react";
import type { ColDef, ICellRendererParams } from "ag-grid-enterprise";
import { Unit } from "@/.prisma-client/enums";
import {
  DATE_COLUMN,
  FORMATTED_NUMERIC_COLUMN,
} from "@/components/grid/column-types";
import { LinkAnchor } from "@/components/navigation/link-anchor";
import {
  getUniqueMultiValueFilterLabels,
  multiValueSetFilterColumn,
} from "@/components/grid/multi-value-set-filter";
import { OPENING_BALANCES_MANAGEMENT_MESSAGE } from "@/shared/opening-balances";
import {
  getCurrencyDecimals,
  getUnitDisplayDecimals,
} from "@/shared/unit-format";
import type { TransactionsBookingRow, TransactionsRow } from "./-page-types";

type RebookClickArgs = {
  bookingId: string;
  transactionId: string;
  currentAccountId: string;
  bookingValue: number;
  bookingUnit: {
    unit: Unit | null;
    currency: string | null;
    cryptocurrency: string | null;
    symbol: string | null;
    tradeCurrency: string | null;
  };
};

export function getTransactionAccountFilterValues(
  accounts: Array<{ name: string }> | null | undefined,
): string[] {
  return getUniqueMultiValueFilterLabels(accounts, (account) => account.name);
}

export function getTransactionUnitIdentifierFilterValues(
  row: Pick<TransactionsRow, "unitIdentifiers"> | null | undefined,
): string[] {
  return row?.unitIdentifiers ?? [];
}

export function useTransactionsColumnDefs(args: {
  accountBookId: string;
  selectedPeriodValue?: string;
  referenceCurrency: string;
  onEditClick: (transactionId: string) => void;
  onRebookClick: (args: RebookClickArgs) => void;
  onCopyClick: (transactionId: string) => void;
  onDeleteClick: (transactionId: string, description: string) => void;
}): {
  columnDefs: ColDef<TransactionsRow>[];
  detailColumnDefs: ColDef<TransactionsBookingRow>[];
} {
  const {
    accountBookId,
    selectedPeriodValue,
    referenceCurrency,
    onEditClick,
    onRebookClick,
    onCopyClick,
    onDeleteClick,
  } = args;

  return useMemo(() => {
    const referenceCurrencyDisplayDecimals =
      getCurrencyDecimals(referenceCurrency);

    const accountSearch = (transactionId: string) => ({
      transactionId,
      period: selectedPeriodValue,
    });

    const renderAccountLinks = (
      accounts: Array<{ id: string; name: string }> | null | undefined,
      transactionId: string,
    ) => {
      if (!accounts?.length) return null;

      return accounts.map((account, index) => (
        <span key={account.id}>
          {index > 0 && ", "}
          <LinkAnchor
            to="/$accountBookId/$accountId"
            params={{ accountBookId, accountId: account.id }}
            search={accountSearch(transactionId)}
            size="sm"
          >
            {account.name}
          </LinkAnchor>
        </span>
      ));
    };

    const detailColumnDefs: ColDef<TransactionsBookingRow>[] = [
      {
        field: "date",
        headerName: "Date",
        width: 130,
        type: DATE_COLUMN,
      },
      {
        field: "account",
        headerName: "Account",
        width: 220,
        cellRenderer: ({
          value,
          data,
        }: ICellRendererParams<
          TransactionsBookingRow,
          TransactionsBookingRow["account"]
        >) => {
          if (!value || !data) return null;
          return (
            <LinkAnchor
              to="/$accountBookId/$accountId"
              params={{ accountBookId, accountId: value.id }}
              search={accountSearch(data.transactionId)}
              size="sm"
            >
              {value.name}
            </LinkAnchor>
          );
        },
      },
      {
        field: "description",
        headerName: "Description",
        minWidth: 260,
        flex: 1,
        filter: "agTextColumnFilter",
      },
      {
        colId: "unitIdentifier",
        headerName: "Ccy./Symbol",
        width: 130,
        filter: true,
        valueGetter: ({ data }: { data?: TransactionsBookingRow }) => {
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
      {
        field: "debit",
        headerName: "Debit",
        width: 130,
        type: FORMATTED_NUMERIC_COLUMN,
        filter: "agNumberColumnFilter",
      },
      {
        field: "credit",
        headerName: "Credit",
        width: 130,
        type: FORMATTED_NUMERIC_COLUMN,
        filter: "agNumberColumnFilter",
      },
      {
        field: "referenceDebit",
        headerName: `Debit (${referenceCurrency})`,
        width: 150,
        type: FORMATTED_NUMERIC_COLUMN,
        context: {
          formattedNumeric: {
            getDisplayDecimals: () => referenceCurrencyDisplayDecimals,
          },
        },
        filter: "agNumberColumnFilter",
      },
      {
        field: "referenceCredit",
        headerName: `Credit (${referenceCurrency})`,
        width: 150,
        type: FORMATTED_NUMERIC_COLUMN,
        context: {
          formattedNumeric: {
            getDisplayDecimals: () => referenceCurrencyDisplayDecimals,
          },
        },
        filter: "agNumberColumnFilter",
      },
      {
        colId: "actions",
        headerName: "",
        width: 70,
        sortable: false,
        filter: false,
        resizable: false,
        suppressHeaderMenuButton: true,
        cellClass: "actions-cell",
        cellRenderer: ({
          data,
        }: ICellRendererParams<TransactionsBookingRow>) => {
          if (!data) return null;
          const isOpeningBalancesTransaction =
            data.isOpeningBalancesTransaction;
          return (
            <Group gap={4} wrap="nowrap" h="100%" align="center">
              <Tooltip
                label={
                  isOpeningBalancesTransaction
                    ? OPENING_BALANCES_MANAGEMENT_MESSAGE
                    : "Rebook"
                }
              >
                <span style={{ display: "inline-flex" }}>
                  <ActionIcon
                    variant="subtle"
                    size="sm"
                    color="blue"
                    disabled={isOpeningBalancesTransaction}
                    onClick={() => {
                      if (isOpeningBalancesTransaction) return;
                      onRebookClick({
                        bookingId: data.id,
                        transactionId: data.transactionId,
                        currentAccountId: data.account.id,
                        bookingValue: data.bookingValue,
                        bookingUnit: {
                          unit: data.unit,
                          currency: data.currency,
                          cryptocurrency: data.cryptocurrency,
                          symbol: data.symbol,
                          tradeCurrency: data.tradeCurrency,
                        },
                      });
                    }}
                    aria-label="Rebook"
                  >
                    <IconSquareArrowRight size={16} />
                  </ActionIcon>
                </span>
              </Tooltip>
            </Group>
          );
        },
      },
    ];

    const columnDefs: ColDef<TransactionsRow>[] = [
      {
        field: "date",
        headerName: "Date",
        width: 170,
        type: DATE_COLUMN,
        cellRenderer: "agGroupCellRenderer",
      },
      {
        field: "debitAccounts",
        headerName: "Debit Account(s)",
        width: 240,
        ...multiValueSetFilterColumn,
        filterValueGetter: ({ data }) =>
          getTransactionAccountFilterValues(data?.debitAccounts),
        cellRenderer: ({
          value,
          data,
        }: ICellRendererParams<
          TransactionsRow,
          TransactionsRow["debitAccounts"]
        >) => {
          if (!data) return null;
          return renderAccountLinks(value, data.transactionId);
        },
      },
      {
        field: "creditAccounts",
        headerName: "Credit Account(s)",
        width: 240,
        ...multiValueSetFilterColumn,
        filterValueGetter: ({ data }) =>
          getTransactionAccountFilterValues(data?.creditAccounts),
        cellRenderer: ({
          value,
          data,
        }: ICellRendererParams<
          TransactionsRow,
          TransactionsRow["creditAccounts"]
        >) => {
          if (!data) return null;
          return renderAccountLinks(value, data.transactionId);
        },
      },
      {
        field: "description",
        headerName: "Description",
        minWidth: 260,
        flex: 1,
        filter: "agTextColumnFilter",
      },
      {
        colId: "unitIdentifiers",
        headerName: "Ccy./Symbol",
        width: 150,
        ...multiValueSetFilterColumn,
        valueGetter: ({ data }) =>
          getTransactionUnitIdentifierFilterValues(data),
      },
      {
        field: "originalAmount",
        headerName: "Amount",
        width: 140,
        type: FORMATTED_NUMERIC_COLUMN,
        context: {
          formattedNumeric: {
            getDisplayDecimals: ({ data }: { data: unknown }) => {
              const row = data as TransactionsRow | undefined;
              return getUnitDisplayDecimals({
                unit: row?.originalAmountUnit,
                currency: row?.originalAmountCurrency,
                cryptocurrency: row?.originalAmountCryptocurrency,
              });
            },
          },
        },
        filter: "agNumberColumnFilter",
      },
      {
        field: "referenceAmount",
        headerName: `Amount (${referenceCurrency})`,
        width: 160,
        type: FORMATTED_NUMERIC_COLUMN,
        context: {
          formattedNumeric: {
            getDisplayDecimals: () => referenceCurrencyDisplayDecimals,
          },
        },
        filter: "agNumberColumnFilter",
      },
      {
        colId: "actions",
        headerName: "",
        width: 120,
        sortable: false,
        filter: false,
        resizable: false,
        suppressHeaderMenuButton: true,
        cellClass: "actions-cell",
        cellRenderer: ({ data }: ICellRendererParams<TransactionsRow>) => {
          if (!data) return null;
          const isOpeningBalancesTransaction =
            data.isOpeningBalancesTransaction;
          return (
            <Group gap={4} wrap="nowrap" h="100%" align="center">
              <Tooltip
                label={
                  isOpeningBalancesTransaction
                    ? OPENING_BALANCES_MANAGEMENT_MESSAGE
                    : "Edit"
                }
              >
                <span style={{ display: "inline-flex" }}>
                  <ActionIcon
                    variant="subtle"
                    size="sm"
                    disabled={isOpeningBalancesTransaction}
                    onClick={() => {
                      if (isOpeningBalancesTransaction) return;
                      onEditClick(data.transactionId);
                    }}
                    aria-label="Edit"
                  >
                    <IconPencil size={16} />
                  </ActionIcon>
                </span>
              </Tooltip>
              <Tooltip
                label={
                  isOpeningBalancesTransaction
                    ? OPENING_BALANCES_MANAGEMENT_MESSAGE
                    : "Copy"
                }
              >
                <span style={{ display: "inline-flex" }}>
                  <ActionIcon
                    variant="subtle"
                    size="sm"
                    disabled={isOpeningBalancesTransaction}
                    onClick={() => {
                      if (isOpeningBalancesTransaction) return;
                      onCopyClick(data.transactionId);
                    }}
                    aria-label="Copy"
                  >
                    <IconCopy size={16} />
                  </ActionIcon>
                </span>
              </Tooltip>
              <Tooltip
                label={
                  isOpeningBalancesTransaction
                    ? OPENING_BALANCES_MANAGEMENT_MESSAGE
                    : "Delete"
                }
              >
                <span style={{ display: "inline-flex" }}>
                  <ActionIcon
                    variant="subtle"
                    size="sm"
                    color="red"
                    disabled={isOpeningBalancesTransaction}
                    onClick={() => {
                      if (isOpeningBalancesTransaction) return;
                      onDeleteClick(data.transactionId, data.description);
                    }}
                    aria-label="Delete"
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </span>
              </Tooltip>
            </Group>
          );
        },
      },
    ];

    return { columnDefs, detailColumnDefs };
  }, [
    accountBookId,
    onCopyClick,
    onDeleteClick,
    onEditClick,
    onRebookClick,
    referenceCurrency,
    selectedPeriodValue,
  ]);
}
