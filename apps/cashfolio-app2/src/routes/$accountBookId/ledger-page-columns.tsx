import { useMemo } from "react";
import { ActionIcon, Group, Tooltip } from "@mantine/core";
import { IconPencil, IconTrash } from "@tabler/icons-react";
import type { ColDef, ICellRendererParams } from "ag-grid-enterprise";
import { Unit } from "../../.prisma-client/enums";
import {
  DATE_COLUMN,
  FORMATTED_NUMERIC_COLUMN,
} from "../../components/column-types";
import { LinkAnchor } from "../../components/link-anchor";
import type { LedgerRow } from "./ledger-page-types";

export function useLedgerColumnDefs(args: {
  accountBookId: string;
  isEquity: boolean;
  isIncome: boolean;
  isExpense: boolean;
  onEditClick: (transactionId: string) => void;
  onDeleteClick: (transactionId: string, description: string) => void;
}): ColDef<LedgerRow>[] {
  const {
    accountBookId,
    isEquity,
    isIncome,
    isExpense,
    onEditClick,
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
        flex: 1,
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
                  onClick={() => onEditClick(data.transactionId)}
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
    [accountBookId, isEquity, isIncome, isExpense, onEditClick, onDeleteClick],
  );
}
