import type {
  CellClassParams,
  ColDef,
  RowDragEndEvent,
} from "ag-grid-enterprise";
import { currencies } from "../currencies";
import { cryptocurrencies } from "../cryptocurrencies";
import {
  isIncomeAccount,
  isExpenseAccount,
  getUnitIdentifier,
} from "../shared/account-utils";
import { useCallback, useMemo, useRef } from "react";
import {
  ActionIcon,
  Box,
  Button,
  Group,
  Stack,
  TextInput,
  ThemeIcon,
  Tooltip,
} from "@mantine/core";
import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../.prisma-client/enums";
import {
  IconInfoCircle,
  IconTablePlus,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import {
  DATE_COLUMN,
  FORMATTED_NUMERIC_COLUMN,
  SELECT_COLUMN,
  TEXT_COLUMN,
} from "./column-types";
import { DataGrid } from "./data-grid";
import type { AgGridReact, CustomCellRendererProps } from "ag-grid-react";
import { createId } from "@paralleldrive/cuid2";
import { sum } from "../utils";
import { numericFormatter } from "react-number-format";
import { getNumberFormatSymbols } from "./formatted-number-input";
import { DateInput } from "@mantine/dates";
import { formRootRule, isNotEmpty, useForm } from "@mantine/form";
import { isAfter, isSameDay, min, parse, startOfDay } from "date-fns";

export type AccountOption = {
  label: string;
  value: string;
  unit: Unit;
  currency?: string | null;
  cryptocurrency?: string | null;
  symbol?: string | null;
  tradeCurrency?: string | null;
  type: AccountType;
  equityAccountSubtype?: EquityAccountSubtype | null;
};

export type BookingValues = {
  key: string;
  date?: string;
  account?: string;
  description?: string;
  unit?: Unit;
  currency?: string;
  cryptocurrency?: string;
  symbol?: string;
  tradeCurrency?: string;
  debit?: number;
  credit?: number;
};

export type TransactionFormValues = {
  date?: Date;
  description?: string;
  bookings: BookingValues[];
};

const currencyOptions = Object.keys(currencies).map((code) => ({
  label: code,
  value: code,
}));

const cryptocurrencyOptions = Object.keys(cryptocurrencies).map((code) => ({
  label: code,
  value: code,
}));

function isEditableCell(params: CellClassParams) {
  const { colDef, node } = params;
  if (node.rowPinned || !params.data) return false;

  if (typeof colDef.editable === "function") {
    return colDef.editable(params as any);
  }

  if (typeof colDef.editable === "boolean") {
    return colDef.editable;
  }

  return true;
}

export function EditTransactionModal({
  initialValues,
  accounts,
  currentAccountId,
  onClose,
  onSubmit,
}: {
  initialValues?: {
    description?: string;
    bookings?: Omit<BookingValues, "key">[];
  };
  accounts: AccountOption[];
  currentAccountId: string;
  onClose: () => void;
  onSubmit: (values: {
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
  }) => Promise<void>;
  onDeleteTransaction?: () => void;
}) {
  const { thousandSeparator, decimalSeparator } =
    getNumberFormatSymbols("en-CH");

  const today = startOfDay(new Date());

  const currentAccount = accounts.find((a) => a.value === currentAccountId);

  const form = useForm({
    mode: "uncontrolled",
    initialValues: {
      date:
        initialValues?.bookings && initialValues.bookings.length > 0
          ? min(
              initialValues.bookings
                .map((d) => d.date as string)
                .filter((d) => !!d),
            )
          : undefined,
      description: initialValues?.description,
      bookings: initialValues?.bookings?.map((b) => ({
        ...b,
        key: createId(),
      })) ?? [
        {
          key: createId(),
          account: currentAccountId,
          unit: currentAccount?.unit,
          currency: currentAccount?.currency ?? undefined,
          cryptocurrency: currentAccount?.cryptocurrency ?? undefined,
          symbol: currentAccount?.symbol ?? undefined,
          tradeCurrency: currentAccount?.tradeCurrency ?? undefined,
        } as BookingValues,
        { key: createId() } as BookingValues,
      ],
    },
    onValuesChange: ({ date }, { date: previousDate }) => {
      if (date !== previousDate) {
        for (let i = 0; i < form.values.bookings.length; i++) {
          form.setFieldValue(`bookings.${i}.date`, date ?? undefined);
        }
      }
    },
    validate: {
      date: (value) => {
        if (!value) return "Date is required";
        if (isAfter(startOfDay(value), today))
          return "Date cannot be in the future";
        return null;
      },
      bookings: {
        [formRootRule]: (bookings) => {
          for (const booking of bookings) {
            if (!booking.account) continue;
            const acct = accounts.find((a) => a.value === booking.account);
            if (!acct) continue;
            if (isIncomeAccount(acct) && booking.debit !== undefined) {
              return "Income accounts cannot have debit entries.";
            }
            if (isExpenseAccount(acct) && booking.credit !== undefined) {
              return "Expense accounts cannot have credit entries.";
            }
          }

          const unitIdentifiers = new Set(
            bookings
              .filter(
                (b): b is BookingValues & { unit: Unit } => b.unit != null,
              )
              .map((b) => getUnitIdentifier(b)),
          );
          if (unitIdentifiers.size !== 1) return null;

          const difference =
            sum(bookings.map((b) => b.debit ?? 0)) -
            sum(bookings.map((b) => b.credit ?? 0));
          return Math.abs(difference) > 0.001
            ? `Transaction is not balanced; debits and credits differ by ${numericFormatter(
                difference.toString(),
                {
                  thousandSeparator,
                  decimalSeparator,
                  decimalScale: 2,
                },
              )}.`
            : null;
        },
        date: (value) => {
          if (!value) return "Date is required";
          if (isAfter(startOfDay(new Date(value)), today))
            return "Date cannot be in the future";
          return null;
        },
        account: isNotEmpty("Account is required"),
        unit: isNotEmpty("Unit is required"),
        debit: (value) => (value === 0 ? "Must be non-zero" : null),
        credit: (value) => (value === 0 ? "Must be non-zero" : null),
      },
    },
  });

  const gridRef = useRef<AgGridReact>(null);

  function onAdd() {
    const newRow = {
      date: form.values.date,
      account: "",
      description: "",
      key: createId(),
    } as BookingValues;
    const result = gridRef.current?.api.applyTransaction({
      add: [newRow],
    });

    gridRef.current?.api.ensureIndexVisible(
      result?.add[0].rowIndex ?? 0,
      "bottom",
    );

    form.insertListItem("bookings", newRow);
  }

  const lockedBookingKey = useMemo(() => {
    const first = form.values.bookings.find(
      (b) => b.account === currentAccountId,
    );
    return first?.key;
  }, [form.values.bookings, currentAccountId]);

  const onRowDragEnd = useCallback(
    (event: RowDragEndEvent<BookingValues>) => {
      const displayOrderKeys: string[] = [];
      event.api.forEachNodeAfterFilterAndSort((node) => {
        if (node.data?.key) {
          displayOrderKeys.push(node.data.key);
        }
      });

      if (displayOrderKeys.length !== form.values.bookings.length) return;

      const currentKeys = form.values.bookings.map((b) => b.key);
      if (!currentKeys.every((key) => displayOrderKeys.includes(key))) return;

      const hasChanged = displayOrderKeys.some(
        (key, index) => key !== currentKeys[index],
      );
      if (!hasChanged) return;

      const bookingByKey = new Map(form.values.bookings.map((b) => [b.key, b]));
      const reorderedBookings = displayOrderKeys
        .map((key) => bookingByKey.get(key))
        .filter((b): b is BookingValues => Boolean(b));

      if (reorderedBookings.length !== form.values.bookings.length) return;
      form.setFieldValue("bookings", reorderedBookings);
    },
    [form],
  );

  const columnDefs = useMemo(
    () =>
      [
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
          rowDrag: ({ data, node }) => !node.rowPinned && Boolean(data),
        },
        {
          field: "date",
          type: DATE_COLUMN,
          cellDataType: "dateString",
          width: 118,
          cellStyle: ({ value, context }: CellClassParams) =>
            isSameDay(value, context.startDate)
              ? { color: "var(--mantine-color-dimmed)" }
              : { color: "var(--mantine-color-yellow-text)", fontWeight: 600 },
          cellEditorParams: ({ context }: any) => ({
            startDate: context.startDate,
          }),
        },
        {
          field: "account",
          type: SELECT_COLUMN,
          context: { options: accounts },
          minWidth: 150,
          flex: 1,
          editable: ({ data, context }) =>
            data?.key !== context.lockedBookingKey,
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
                : context.canDelete
                  ? "At least 2 bookings are required"
                  : null;
            return (
              <Tooltip label={deleteDisabledReason ?? "Delete booking"}>
                <ActionIcon
                  mt={4}
                  color="red"
                  size="md"
                  variant="subtle"
                  disabled={!!deleteDisabledReason}
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
      ] as ColDef[],
    [accounts],
  );

  return (
    <form
      onSubmit={(e) => {
        gridRef.current?.api.stopEditing();
        form.onSubmit(async (values) => {
          await onSubmit({
            description: values.description ?? "",
            bookings: values.bookings.map((b) => ({
              date:
                b.date && typeof b.date === "object" && "toISOString" in b.date
                  ? (b.date as Date).toISOString()
                  : String(b.date ?? ""),
              accountId: b.account ?? "",
              description: b.description ?? "",
              unit: b.unit!,
              currency: b.currency ?? undefined,
              cryptocurrency: b.cryptocurrency ?? undefined,
              symbol: b.symbol ?? undefined,
              tradeCurrency: b.tradeCurrency ?? undefined,
              value: b.debit ? b.debit : -(b.credit ?? 0),
            })),
          });
        }, console.error)(e);
      }}
    >
      <Stack gap="md">
        <Group align="start">
          <DateInput
            valueFormat="DD.MM.YYYY"
            dateParser={(value) => parse(value, "dd.MM.yyyy", new Date())}
            w={140}
            label={
              <Group gap={4}>
                Date
                <Tooltip
                  label={
                    <>
                      Changing this date overwrites all booking dates.
                      <br /> Individual bookings can be set to a later date.
                    </>
                  }
                  position="bottom-start"
                >
                  <IconInfoCircle size={16} />
                </Tooltip>
              </Group>
            }
            {...form.getInputProps("date")}
          />
          <TextInput
            label="Description"
            {...form.getInputProps("description")}
            flex="1"
          />
          <Button
            mt={24.8}
            variant="default"
            leftSection={<IconTablePlus size={16} />}
            onClick={() => onAdd()}
            data-testid="transaction-add-booking"
          >
            Add booking
          </Button>
        </Group>
        <DataGrid
          ref={gridRef}
          containerStyle={{
            height: `calc(100vh - 30.5rem)`,
          }}
          rowData={form.values.bookings}
          getRowId={({ data }) => data.key}
          columnDefs={columnDefs}
          rowDragManaged
          animateRows
          onRowDragEnd={onRowDragEnd}
          defaultColDef={{
            editable: true,
            resizable: false,
            sortable: false,
            suppressHeaderMenuButton: true,
            cellClassRules: {
              "ag-cell-disabled": (params) => {
                if (params.node.rowPinned || !params.data) return false;
                if (params.colDef.editable === false) return false;
                return !isEditableCell(params);
              },
            },
          }}
          onCellValueChanged={(e) => {
            if (e.rowIndex == null) return;

            if (e.colDef.colId === "ccy") {
              const booking = form.values.bookings[e.rowIndex];
              switch (booking?.unit) {
                case Unit.CURRENCY:
                  form.setFieldValue(
                    `bookings.${e.rowIndex}.currency`,
                    e.newValue,
                  );
                  break;
                case Unit.CRYPTOCURRENCY:
                  form.setFieldValue(
                    `bookings.${e.rowIndex}.cryptocurrency`,
                    e.newValue,
                  );
                  break;
                case Unit.SECURITY:
                  form.setFieldValue(
                    `bookings.${e.rowIndex}.tradeCurrency`,
                    e.newValue,
                  );
                  break;
              }
            } else {
              form.setFieldValue(
                `bookings.${e.rowIndex}.${e.colDef.field}`,
                e.newValue,
              );
            }

            if (e.colDef.field === "account") {
              const currentBooking = form.values.bookings[e.rowIndex];
              if (!currentBooking) return;

              const selectedAccount = accounts.find(
                (a) => a.value === e.newValue,
              );
              if (selectedAccount) {
                const clearDebit = isIncomeAccount(selectedAccount);
                const clearCredit = isExpenseAccount(selectedAccount);

                const nextBooking: BookingValues = {
                  ...currentBooking,
                  account: e.newValue ?? undefined,
                  unit: selectedAccount.unit,
                  currency: selectedAccount.currency ?? undefined,
                  cryptocurrency: selectedAccount.cryptocurrency ?? undefined,
                  symbol: selectedAccount.symbol ?? undefined,
                  tradeCurrency: selectedAccount.tradeCurrency ?? undefined,
                  debit: clearDebit ? undefined : currentBooking.debit,
                  credit: clearCredit ? undefined : currentBooking.credit,
                };

                form.setFieldValue(`bookings.${e.rowIndex}`, nextBooking);

                const rowNode = e.api.getRowNode(e.data.key);
                if (rowNode) {
                  rowNode.setData(nextBooking);
                }
              }
            }

            if (e.colDef.field === "debit" || e.colDef.field === "credit") {
              form.setFieldValue(
                `bookings.${e.rowIndex}.${e.colDef.field === "credit" ? "debit" : "credit"}`,
                undefined,
              );
            }
          }}
          grandTotalRow="pinnedBottom"
          context={{
            status: form.isValid("bookings") ? null : form.errors.bookings,
            canDelete: form.values.bookings.length <= 2,
            lockedBookingKey,
            onDelete: (key: string) => {
              const index = form.values.bookings.findIndex(
                (b) => b.key === key,
              );

              if (index === -1) throw new Error("Booking not found");

              form.removeListItem("bookings", index);
            },
            startDate: form.values.date,
            form,
          }}
        />

        <Group justify="end">
          <Group>
            <Button variant="subtle" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" data-testid="transaction-modal-submit">
              {initialValues ? "Save" : "Create"}
            </Button>
          </Group>
        </Group>
      </Stack>
    </form>
  );
}
