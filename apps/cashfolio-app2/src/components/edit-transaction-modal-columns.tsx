import type { CellClassParams, ColDef } from "ag-grid-enterprise";
import type { CustomCellRendererProps } from "ag-grid-react";
import { ActionIcon, Box, Group, ThemeIcon, Tooltip } from "@mantine/core";
import { IconTrash, IconX } from "@tabler/icons-react";
import { Unit } from "../.prisma-client/enums";
import type { AccountBookUnitUsage } from "../shared/account-book-unit-usage";
import {
  getUnitIdentifier,
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
import {
  buildCryptocurrencySelectData,
  buildCurrencySelectData,
} from "./unit-select-options";

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

function getValidFooterUnitIdentifier(booking: BookingValues): string | null {
  if (!booking.unit) return null;

  if (booking.unit === Unit.CURRENCY && !booking.currency) return null;
  if (booking.unit === Unit.CRYPTOCURRENCY && !booking.cryptocurrency) {
    return null;
  }
  if (booking.unit === Unit.SECURITY && !booking.symbol) return null;

  return getUnitIdentifier({
    unit: booking.unit,
    currency: booking.currency,
    cryptocurrency: booking.cryptocurrency,
    symbol: booking.symbol,
  });
}

function hasFooterAmount(booking: BookingValues): boolean {
  return booking.debit != null || booking.credit != null;
}

export function getMixedUnitTransactionFooterLabel(args: {
  bookings: BookingValues[];
}): "Multiple Units" | null {
  let firstUnitIdentifier: string | null = null;

  for (const booking of args.bookings) {
    if (!hasFooterAmount(booking)) continue;

    const unitIdentifier = getValidFooterUnitIdentifier(booking);
    if (!unitIdentifier) return "Multiple Units";

    if (firstUnitIdentifier == null) {
      firstUnitIdentifier = unitIdentifier;
      continue;
    }

    if (firstUnitIdentifier !== unitIdentifier) {
      return "Multiple Units";
    }
  }

  return null;
}

function getMixedUnitTransactionFooterLabelFromContext(
  context: CustomCellRendererProps["context"],
): "Multiple Units" | null {
  const bookings = context?.form?.values?.bookings;
  if (!Array.isArray(bookings)) return null;

  return getMixedUnitTransactionFooterLabel({ bookings });
}

function createMixedUnitTransactionFooterCellRendererSelector() {
  return ({ context, node }: CustomCellRendererProps) => {
    if (!node.rowPinned) return undefined;

    const label = getMixedUnitTransactionFooterLabelFromContext(context);
    return label
      ? {
          component: () => label,
        }
      : undefined;
  };
}

export function createEditTransactionColumnDefs(args: {
  accounts: AccountOption[];
  isSubmitting: boolean;
  accountBookStartDate: Date;
  unitUsage?: AccountBookUnitUsage;
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
            ? buildCryptocurrencySelectData({
                unitUsage: args.unitUsage,
                selectedCryptocurrencies: [data?.cryptocurrency],
                compactLabels: true,
              })
            : buildCurrencySelectData({
                unitUsage: args.unitUsage,
                selectedCurrencies: [data?.currency, data?.tradeCurrency],
                compactLabels: true,
              }),
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
      suppressMovable: true,
      colSpan: ({ context, node }) =>
        node?.rowPinned &&
        getMixedUnitTransactionFooterLabelFromContext(context)
          ? 2
          : 1,
      cellRendererSelector:
        createMixedUnitTransactionFooterCellRendererSelector(),
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
      suppressMovable: true,
      editable: ({ data }) => {
        if (!data?.account) return true;
        const acct = accounts.find((a) => a.value === data.account);
        return !isExpenseAccount(acct);
      },
      tooltip: ({ context, node }) =>
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
          <Tooltip label={deleteDisabledReason ?? "Delete Booking"}>
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
              aria-label="Delete Booking"
            >
              <IconTrash size={16} />
            </ActionIcon>
          </Tooltip>
        );
      },
    },
  ];
}
