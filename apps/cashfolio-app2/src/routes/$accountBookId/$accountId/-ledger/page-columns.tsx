import { useLedgerNavigationState } from "@/hooks/use-ledger-navigation-state";
import { useMemo } from "react";
import type { ColDef, ICellRendererParams } from "ag-grid-enterprise";
import { Unit } from "@/.prisma-client/enums";
import {
  DATE_COLUMN,
  FORMATTED_NUMERIC_COLUMN,
} from "@/components/grid/column-types";
import { LinkAnchor } from "@/components/navigation/link-anchor";
import {
  getCurrencyDecimals,
  getUnitDisplayDecimals,
} from "@/shared/unit-format";
import {
  getUniqueMultiValueFilterLabels,
  multiValueSetFilterColumn,
} from "@/components/grid/multi-value-set-filter";
import { isReferenceCurrencyUnit } from "@/shared/reference-currency-display";
import type { LedgerRow } from "./page-types";
import { LedgerActionsCell } from "./actions-cell";
import { rowActionsColumnProps } from "@/components/grid/row-actions-menu";
import { getUnitFilterValue } from "@/components/grid/unit-filter-value";
import { buildCounterpartyLedgerSearch } from "./counterparty-ledger-search";

export function getLedgerCounterpartyAccountFilterValues(
  accounts: Array<{ name: string }> | null | undefined,
): string[] {
  return getUniqueMultiValueFilterLabels(accounts, (account) => account.name);
}

export function getLedgerUnitIdentifierDisplayValue(args: {
  data: LedgerRow | undefined;
  referenceCurrency: string | null;
}): string | null {
  const { data, referenceCurrency } = args;
  if (!data) return null;
  if (
    isReferenceCurrencyUnit({
      unit: data.unit,
      currency: data.currency,
      referenceCurrency,
    })
  ) {
    return null;
  }

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
}

export function getLedgerBookingAmountDisplayValue(args: {
  data: LedgerRow | undefined;
  hideReferenceCurrencyAmount: boolean;
  referenceCurrency: string | null;
  value: number | null | undefined;
}): number | null {
  const { data, hideReferenceCurrencyAmount, referenceCurrency, value } = args;
  if (!data || value == null) return null;
  if (
    hideReferenceCurrencyAmount &&
    isReferenceCurrencyUnit({
      unit: data.unit,
      currency: data.currency,
      referenceCurrency,
    })
  ) {
    return null;
  }
  return value;
}

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
  onCopyClick: (transactionId: string) => void;
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
    onCopyClick,
    onDeleteClick,
  } = args;

  const ledgerNavigationState = useLedgerNavigationState();

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
        ...multiValueSetFilterColumn,
        filterValueGetter: ({ data }) =>
          getLedgerCounterpartyAccountFilterValues(data?.counterpartyAccounts),
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
                state={ledgerNavigationState}
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
              filter: "agSetColumnFilter",
              filterValueGetter: ({ data }: { data?: LedgerRow }) =>
                getUnitFilterValue(data),
              valueGetter: ({ data }: { data?: LedgerRow }) => {
                return getLedgerUnitIdentifierDisplayValue({
                  data,
                  referenceCurrency,
                });
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
              valueGetter: ({ data }: { data?: LedgerRow }) =>
                getLedgerBookingAmountDisplayValue({
                  data,
                  hideReferenceCurrencyAmount: isEquity && !isOpeningBalances,
                  referenceCurrency,
                  value: data?.debit,
                }),
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
              valueGetter: ({ data }: { data?: LedgerRow }) =>
                getLedgerBookingAmountDisplayValue({
                  data,
                  hideReferenceCurrencyAmount: isEquity && !isOpeningBalances,
                  referenceCurrency,
                  value: data?.credit,
                }),
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
        ...rowActionsColumnProps,
        width: 88,
        minWidth: 88,
        maxWidth: 88,
        cellRenderer: ({ data }: ICellRendererParams<LedgerRow>) =>
          data ? (
            <LedgerActionsCell
              row={data}
              onEditClick={onEditClick}
              onCopyClick={onCopyClick}
              onRebookClick={onRebookClick}
              onDeleteClick={onDeleteClick}
            />
          ) : null,
      },
    ];
  }, [
    ledgerNavigationState,
    accountBookId,
    hasPeriodFilter,
    selectedPeriodValue,
    referenceCurrency,
    isEquity,
    isOpeningBalances,
    isIncome,
    isExpense,
    onCopyClick,
    onEditClick,
    onRebookClick,
    onDeleteClick,
  ]);
}
