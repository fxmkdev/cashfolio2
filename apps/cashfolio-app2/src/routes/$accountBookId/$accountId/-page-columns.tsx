import { useMemo } from "react";
import { ActionIcon, Group, Tooltip } from "@mantine/core";
import {
  IconPencil,
  IconSquareArrowRight,
  IconTrash,
} from "@tabler/icons-react";
import type { ColDef, ICellRendererParams } from "ag-grid-enterprise";
import { Unit } from "@/.prisma-client/enums";
import {
  DATE_COLUMN,
  FORMATTED_NUMERIC_COLUMN,
} from "@/components/column-types";
import { LinkAnchor } from "@/components/link-anchor";
import {
  getCurrencyDecimals,
  getUnitDisplayDecimals,
} from "@/shared/unit-format";
import type { LedgerRow } from "./-page-types";
import { OPENING_BALANCES_MANAGEMENT_MESSAGE } from "@/shared/opening-balances";
import { buildCounterpartyLedgerSearch } from "./-counterparty-ledger-search";

export function useLedgerColumnDefs(args: {
  accountBookId: string;
  hasPeriodFilter: boolean;
  selectedPeriodValue?: string;
  referenceCurrency: string | null;
  isEquity: boolean;
  isOpeningBalances: boolean;
  isIncome: boolean;
  isExpense: boolean;
  onEditClick: (transactionId: string) => void;
  onRebookClick: (args: {
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
  }) => void;
  onDeleteClick: (transactionId: string, description: string) => void;
}): ColDef<LedgerRow>[] {
  const {
    accountBookId,
    hasPeriodFilter,
    selectedPeriodValue,
    referenceCurrency,
    isEquity,
    isOpeningBalances,
    isIncome,
    isExpense,
    onEditClick,
    onRebookClick,
    onDeleteClick,
  } = args;

  return useMemo<ColDef<LedgerRow>[]>(() => {
    const referenceCurrencyDisplayDecimals =
      getCurrencyDecimals(referenceCurrency);

    return [
      {
        field: "date",
        headerName: "Date",
        width: 130,
        type: DATE_COLUMN,
      },
      {
        field: "counterpartyAccounts",
        headerName: "Account(s)",
        width: 240,
        cellRenderer: ({
          value,
          data,
        }: ICellRendererParams<
          LedgerRow,
          LedgerRow["counterpartyAccounts"]
        >) => {
          if (!value || !data) return null;
          return value.map((account, index) => (
            <span key={account.id}>
              {index > 0 && ", "}
              <LinkAnchor
                to="/$accountBookId/$accountId"
                params={{ accountBookId, accountId: account.id }}
                search={buildCounterpartyLedgerSearch({
                  transactionId: data.transactionId,
                  selectedPeriodValue,
                })}
                size="sm"
              >
                {account.name}
              </LinkAnchor>
            </span>
          ));
        },
      },
      {
        field: "description",
        headerName: "Description",
        minWidth: 260,
        flex: 1,
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
      ...(isEquity && !isOpeningBalances && !isIncome
        ? [
            {
              field: "referenceDebit" as const,
              headerName: referenceCurrency
                ? `Debit (${referenceCurrency})`
                : "Debit (Ref)",
              width: 150,
              type: FORMATTED_NUMERIC_COLUMN,
              context: {
                formattedNumeric: {
                  getDisplayDecimals: () => referenceCurrencyDisplayDecimals,
                },
              },
              filter: "agNumberColumnFilter",
            },
          ]
        : []),
      ...(isEquity && !isOpeningBalances && !isExpense
        ? [
            {
              field: "referenceCredit" as const,
              headerName: referenceCurrency
                ? `Credit (${referenceCurrency})`
                : "Credit (Ref)",
              width: 150,
              type: FORMATTED_NUMERIC_COLUMN,
              context: {
                formattedNumeric: {
                  getDisplayDecimals: () => referenceCurrencyDisplayDecimals,
                },
              },
              filter: "agNumberColumnFilter",
            },
          ]
        : []),
      ...(isEquity && !hasPeriodFilter
        ? []
        : [
            {
              field: "balance" as const,
              headerName:
                isEquity && hasPeriodFilter && referenceCurrency
                  ? `Balance (${referenceCurrency})`
                  : "Balance",
              width: 150,
              type: FORMATTED_NUMERIC_COLUMN,
              context: {
                formattedNumeric: {
                  getDisplayDecimals: ({
                    data,
                  }: {
                    data: LedgerRow | undefined;
                  }) =>
                    isEquity && hasPeriodFilter
                      ? referenceCurrencyDisplayDecimals
                      : getUnitDisplayDecimals({
                          unit: data?.unit ?? null,
                          currency: data?.currency,
                          cryptocurrency: data?.cryptocurrency,
                        }),
                },
              },
              filter: "agNumberColumnFilter",
            },
          ]),
      {
        colId: "actions",
        headerName: "",
        width: 120,
        sortable: false,
        filter: false,
        resizable: false,
        suppressHeaderMenuButton: true,
        cellClass: "actions-cell",
        cellRenderer: ({ data }: ICellRendererParams<LedgerRow>) => {
          if (!data) return null;
          if (data.isVirtualCarryOver) return null;
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
  }, [
    accountBookId,
    hasPeriodFilter,
    selectedPeriodValue,
    referenceCurrency,
    isEquity,
    isOpeningBalances,
    isIncome,
    isExpense,
    onEditClick,
    onRebookClick,
    onDeleteClick,
  ]);
}
