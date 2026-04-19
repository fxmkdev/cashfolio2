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
import type { LedgerRow } from "./-page-types";

export function useLedgerColumnDefs(args: {
  accountBookId: string;
  hasPeriodFilter: boolean;
  referenceCurrency: string | null;
  isEquity: boolean;
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
    referenceCurrency,
    isEquity,
    isIncome,
    isExpense,
    onEditClick,
    onRebookClick,
    onDeleteClick,
  } = args;

  return useMemo<ColDef<LedgerRow>[]>(
    () => [
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
                search={{ transactionId: data.transactionId }}
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
      ...(isEquity && !isIncome
        ? [
            {
              field: "referenceDebit" as const,
              headerName: referenceCurrency
                ? `Debit (${referenceCurrency})`
                : "Debit (Ref)",
              width: 150,
              type: FORMATTED_NUMERIC_COLUMN,
              filter: "agNumberColumnFilter",
            },
          ]
        : []),
      ...(isEquity && !isExpense
        ? [
            {
              field: "referenceCredit" as const,
              headerName: referenceCurrency
                ? `Credit (${referenceCurrency})`
                : "Credit (Ref)",
              width: 150,
              type: FORMATTED_NUMERIC_COLUMN,
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
          return (
            <Group gap={4} wrap="nowrap" h="100%" align="center">
              <Tooltip label="Edit">
                <ActionIcon
                  variant="subtle"
                  size="sm"
                  onClick={() => onEditClick(data.transactionId)}
                  aria-label="Edit"
                >
                  <IconPencil size={16} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Rebook">
                <ActionIcon
                  variant="subtle"
                  size="sm"
                  color="blue"
                  onClick={() =>
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
                    })
                  }
                  aria-label="Rebook"
                >
                  <IconSquareArrowRight size={16} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Delete">
                <ActionIcon
                  variant="subtle"
                  size="sm"
                  color="red"
                  onClick={() =>
                    onDeleteClick(data.transactionId, data.description)
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
    [
      accountBookId,
      hasPeriodFilter,
      referenceCurrency,
      isEquity,
      isIncome,
      isExpense,
      onEditClick,
      onRebookClick,
      onDeleteClick,
    ],
  );
}
