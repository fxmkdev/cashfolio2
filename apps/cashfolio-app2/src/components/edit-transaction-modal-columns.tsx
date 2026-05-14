import type { CellClassParams, ColDef } from "ag-grid-enterprise";
import type { CustomCellRendererProps } from "ag-grid-react";
import { ActionIcon, Box, Group, ThemeIcon, Tooltip } from "@mantine/core";
import { IconTrash, IconX } from "@tabler/icons-react";
import { Unit } from "../.prisma-client/enums";
import { currencies } from "../currencies";
import { cryptocurrencies } from "../cryptocurrencies";
import {
  isExpenseAccount,
  isIncomeAccount,
  isOpeningBalancesAccount,
} from "../shared/account-utils";
import { isSameDay } from "date-fns";
import {
  DATE_COLUMN,
  FORMATTED_NUMERIC_COLUMN,
  ACCOUNT_TREE_SELECT_COLUMN,
  SELECT_COLUMN,
  TEXT_COLUMN,
} from "./column-types";
import type {
  AccountOption,
  BookingValues,
} from "./edit-transaction-modal-types";

const currencyOptions = Object.keys(currencies).map((code) => ({
  label: code,
  value: code,
}));

const cryptocurrencyOptions = Object.keys(cryptocurrencies).map((code) => ({
  label: code,
  value: code,
}));

export function isEditableCell(params: CellClassParams) {
  const { colDef, node } = params;
  if (node.rowPinned || !params.data) return false;

  if (typeof colDef.editable === "function") {
    return colDef.editable(params as never);
  }

  if (typeof colDef.editable === "boolean") {
    return colDef.editable;
  }

  return true;
}

export function createEditTransactionColumnDefs(args: {
  accounts: AccountOption[];
  isSubmitting: boolean;
  accountBookStartDate: Date;
}): ColDef[] {
  const { accounts, isSubmitting, accountBookStartDate } = args;

  return [
    {
      editable: false,
      width: 0,
      colSpan: (params) => (params.data ? 1 : 8),
      cellRendererSelector: (params) => {
        if (!params.data) {
          return {
            component: ({ context }: CustomCellRendererProps) => {
              if (!context.status) return null;
              return (
                <Group align="center" h="100%" gap="xs">
                  <ThemeIcon variant="light" size="sm" color="red">
                    <IconX size={14} />
                  </ThemeIcon>
                  <Box>{context.status}</Box>
                </Group>
              );
            },
          };
        }

        return undefined;
      },
    },
    {
      colId: "drag",
      headerName: "",
      editable: false,
      width: 40,
      rowDrag: ({ data, node }) =>
        !isSubmitting && !node.rowPinned && Boolean(data),
    },
    {
      field: "date",
      type: DATE_COLUMN,
      cellDataType: "dateString",
      width: 118,
      editable: ({ data }) => {
        if (!data?.account) return true;
        const account = accounts.find((item) => item.value === data.account);
        return !isOpeningBalancesAccount(account);
      },
      cellStyle: ({ value, context }: CellClassParams) => {
        const isStartDate = isSameDay(value as Date, context.startDate as Date);
        return isStartDate
          ? { color: "var(--mantine-color-dimmed)", fontWeight: 400 }
          : { color: "var(--mantine-color-yellow-text)", fontWeight: 600 };
      },
      cellEditorParams: ({
        context,
      }: {
        context: { accountBookStartDate?: Date };
      }) => ({
        startDate: context.accountBookStartDate ?? accountBookStartDate,
      }),
    },
    {
      field: "account",
      type: ACCOUNT_TREE_SELECT_COLUMN,
      context: { options: accounts },
      minWidth: 150,
      flex: 1,
      editable: ({ data, context }) => data?.key !== context.lockedBookingKey,
      cellStyle: ({ context, node }: CellClassParams) =>
        context.form.errors[`bookings.${node.rowIndex}.account`]
          ? { borderColor: "var(--mantine-color-error)" }
          : { borderColor: "transparent" },
    },
    {
      field: "description",
      type: TEXT_COLUMN,
      width: 150,
    },
    {
      field: "unit",
      type: SELECT_COLUMN,
      editable: ({ data }) => {
        if (!data?.account) return true;
        const acct = accounts.find((a) => a.value === data.account);
        return !acct?.unit;
      },
      width: 120,
      context: {
        options: [
          { label: "Currency", value: Unit.CURRENCY },
          { label: "Crypto", value: Unit.CRYPTOCURRENCY },
          { label: "Security", value: Unit.SECURITY },
        ],
      },
    },
    {
      colId: "ccy",
      headerName: "Ccy.",
      type: SELECT_COLUMN,
      editable: ({ data }) => {
        if (!data?.account) return true;
        const acct = accounts.find((a) => a.value === data.account);
        return !acct?.unit;
      },
      width: 90,
      valueFormatter: ({ value }: { value: unknown }) =>
        (value as string) ?? "",
      valueGetter: ({ data }: { data?: BookingValues }) => {
        if (!data) return null;
        switch (data.unit) {
          case Unit.CURRENCY:
            return data.currency ?? null;
          case Unit.CRYPTOCURRENCY:
            return data.cryptocurrency ?? null;
          case Unit.SECURITY:
            return data.tradeCurrency ?? null;
          default:
            return null;
        }
      },
      cellEditorParams: ({ data }: { data?: BookingValues }) => ({
        options:
          data?.unit === Unit.CRYPTOCURRENCY
            ? cryptocurrencyOptions
            : currencyOptions,
      }),
      valueSetter: ({
        data,
        newValue,
      }: {
        data: BookingValues;
        newValue: string | null;
      }) => {
        switch (data.unit) {
          case Unit.CURRENCY:
            data.currency = newValue ?? undefined;
            break;
          case Unit.CRYPTOCURRENCY:
            data.cryptocurrency = newValue ?? undefined;
            break;
          case Unit.SECURITY:
            data.tradeCurrency = newValue ?? undefined;
            break;
        }
        return true;
      },
    },
    {
      field: "symbol",
      headerName: "Symbol",
      type: TEXT_COLUMN,
      editable: ({ data }) => {
        if (data?.unit !== Unit.SECURITY) return false;
        if (!data?.account) return true;
        const acct = accounts.find((a) => a.value === data.account);
        return !acct?.unit;
      },
      width: 90,
    },
    {
      field: "debit",
      type: FORMATTED_NUMERIC_COLUMN,
      context: { formattedNumeric: { formattedNumericMode: "entry" } },
      aggFunc: "sum",
      width: 105,
      editable: ({ data }) => {
        if (!data?.account) return true;
        const acct = accounts.find((a) => a.value === data.account);
        return !isIncomeAccount(acct);
      },
      cellStyle: ({ context, node }: CellClassParams) =>
        context.form.errors[`bookings.${node.rowIndex}.debit`]
          ? { borderColor: "var(--mantine-color-error)" }
          : { borderColor: "transparent" },
    },
    {
      field: "credit",
      type: FORMATTED_NUMERIC_COLUMN,
      context: { formattedNumeric: { formattedNumericMode: "entry" } },
      aggFunc: "sum",
      width: 105,
      editable: ({ data }) => {
        if (!data?.account) return true;
        const acct = accounts.find((a) => a.value === data.account);
        return !isExpenseAccount(acct);
      },
      tooltipValueGetter: ({ context, node }) =>
        context.form.errors[`bookings.${node?.rowIndex}.credit`],
      cellStyle: ({ context, node }) =>
        context.form.errors[`bookings.${node?.rowIndex}.credit`]
          ? { borderColor: "var(--mantine-color-error)" }
          : { borderColor: "transparent" },
    },
    {
      editable: false,
      width: 60,
      cellClass: "actions-cell",
      cellRenderer: ({ data, context }: CustomCellRendererProps) => {
        if (!data) return;
        const deleteDisabledReason =
          data.key === context.lockedBookingKey
            ? "Current account booking cannot be deleted"
            : context.deleteDisabled
              ? "At least 2 bookings are required"
              : null;
        return (
          <Tooltip label={deleteDisabledReason ?? "Delete booking"}>
            <ActionIcon
              mt={4}
              color="red"
              size="md"
              variant="subtle"
              disabled={isSubmitting || !!deleteDisabledReason}
              onClick={() => {
                if (context.onDelete) {
                  context.onDelete(data.key);
                }
              }}
              aria-label="Delete booking"
            >
              <IconTrash size={16} />
            </ActionIcon>
          </Tooltip>
        );
      },
    },
  ];
}
