import type { RowDragEndEvent } from "ag-grid-enterprise";
import type { AgGridReact } from "ag-grid-react";
import { Button, Group, Stack, TextInput, Tooltip } from "@mantine/core";
import { DateInput } from "@mantine/dates";
import { formRootRule, isNotEmpty, useForm } from "@mantine/form";
import { IconInfoCircle, IconTablePlus } from "@tabler/icons-react";
import { createId } from "@paralleldrive/cuid2";
import { isAfter, parse, startOfDay } from "date-fns";
import { numericFormatter } from "react-number-format";
import { useCallback, useMemo, useRef } from "react";
import { Unit } from "../.prisma-client/enums";
import { useDialogSubmitState } from "../hooks/use-dialog-submit-state";
import {
  getUnitIdentifier,
  isExpenseAccount,
  isIncomeAccount,
} from "../shared/account-utils";
import { sum } from "../utils";
import { DataGrid } from "./data-grid";
import {
  createEditTransactionColumnDefs,
  isEditableCell,
} from "./edit-transaction-modal-columns";
import type {
  AccountOption,
  BookingValues,
} from "./edit-transaction-modal-types";
import {
  createTransactionFormInitialValues,
  toTransactionSubmitBookings,
} from "./edit-transaction-modal-values";
import { getNumberFormatSymbols } from "./formatted-number-input";

export type {
  AccountOption,
  BookingValues,
  TransactionFormValues,
} from "./edit-transaction-modal-types";

export function EditTransactionModal({
  initialValues,
  submitLabel,
  accounts,
  currentAccountId,
  onClose,
  onSubmittingChange,
  onSubmit,
}: {
  initialValues?: {
    description?: string;
    bookings?: Omit<BookingValues, "key">[];
  };
  submitLabel?: string;
  accounts: AccountOption[];
  currentAccountId: string;
  onClose: () => void;
  onSubmittingChange?: (isSubmitting: boolean) => void;
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
  const { isSubmitting, runSubmit } = useDialogSubmitState({
    onSubmittingChange,
  });
  const today = startOfDay(new Date());
  const currentAccount = accounts.find((a) => a.value === currentAccountId);

  const form = useForm({
    mode: "uncontrolled",
    initialValues: createTransactionFormInitialValues({
      initialValues,
      currentAccountId,
      currentAccount,
    }),
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
        if (isAfter(startOfDay(value), today)) {
          return "Date cannot be in the future";
        }
        return null;
      },
      bookings: {
        [formRootRule]: (bookings) => {
          for (const booking of bookings) {
            if (!booking.account) continue;
            const account = accounts.find((a) => a.value === booking.account);
            if (!account) continue;
            if (isIncomeAccount(account) && booking.debit !== undefined) {
              return "Income accounts cannot have debit entries.";
            }
            if (isExpenseAccount(account) && booking.credit !== undefined) {
              return "Expense accounts cannot have credit entries.";
            }
          }

          const unitIdentifiers = new Set(
            bookings
              .filter(
                (booking): booking is BookingValues & { unit: Unit } =>
                  booking.unit != null,
              )
              .map((booking) => getUnitIdentifier(booking)),
          );
          if (unitIdentifiers.size !== 1) return null;

          const difference =
            sum(bookings.map((booking) => booking.debit ?? 0)) -
            sum(bookings.map((booking) => booking.credit ?? 0));
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
          if (isAfter(startOfDay(new Date(value)), today)) {
            return "Date cannot be in the future";
          }
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
      (booking) => booking.account === currentAccountId,
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

      const currentKeys = form.values.bookings.map((booking) => booking.key);
      if (!currentKeys.every((key) => displayOrderKeys.includes(key))) return;

      const hasChanged = displayOrderKeys.some(
        (key, index) => key !== currentKeys[index],
      );
      if (!hasChanged) return;

      const bookingByKey = new Map(
        form.values.bookings.map((booking) => [booking.key, booking]),
      );
      const reorderedBookings = displayOrderKeys
        .map((key) => bookingByKey.get(key))
        .filter((booking): booking is BookingValues => Boolean(booking));

      if (reorderedBookings.length !== form.values.bookings.length) return;
      form.setFieldValue("bookings", reorderedBookings);
    },
    [form],
  );

  const columnDefs = useMemo(
    () =>
      createEditTransactionColumnDefs({
        accounts,
        isSubmitting,
      }),
    [accounts, isSubmitting],
  );

  return (
    <form
      onSubmit={(event) => {
        gridRef.current?.api.stopEditing();
        form.onSubmit(
          (values) =>
            runSubmit(() =>
              onSubmit({
                description: values.description ?? "",
                bookings: toTransactionSubmitBookings(values.bookings),
              }),
            ),
          console.error,
        )(event);
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
            disabled={isSubmitting}
            {...form.getInputProps("date")}
          />
          <TextInput
            label="Description"
            {...form.getInputProps("description")}
            disabled={isSubmitting}
            flex="1"
          />
          <Button
            type="button"
            mt={24.8}
            variant="default"
            leftSection={<IconTablePlus size={16} />}
            disabled={isSubmitting}
            onClick={() => onAdd()}
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
            editable: !isSubmitting,
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
          onCellValueChanged={(event) => {
            if (event.rowIndex == null) return;

            if (event.colDef.colId === "ccy") {
              const booking = form.values.bookings[event.rowIndex];
              switch (booking?.unit) {
                case Unit.CURRENCY:
                  form.setFieldValue(
                    `bookings.${event.rowIndex}.currency`,
                    event.newValue,
                  );
                  break;
                case Unit.CRYPTOCURRENCY:
                  form.setFieldValue(
                    `bookings.${event.rowIndex}.cryptocurrency`,
                    event.newValue,
                  );
                  break;
                case Unit.SECURITY:
                  form.setFieldValue(
                    `bookings.${event.rowIndex}.tradeCurrency`,
                    event.newValue,
                  );
                  break;
              }
            } else {
              form.setFieldValue(
                `bookings.${event.rowIndex}.${event.colDef.field}`,
                event.newValue,
              );
            }

            if (event.colDef.field === "account") {
              const currentBooking = form.values.bookings[event.rowIndex];
              if (!currentBooking) return;

              const selectedAccount = accounts.find(
                (account) => account.value === event.newValue,
              );
              if (selectedAccount) {
                const clearDebit = isIncomeAccount(selectedAccount);
                const clearCredit = isExpenseAccount(selectedAccount);

                const nextBooking: BookingValues = {
                  ...currentBooking,
                  account: event.newValue ?? undefined,
                  unit: selectedAccount.unit,
                  currency: selectedAccount.currency ?? undefined,
                  cryptocurrency: selectedAccount.cryptocurrency ?? undefined,
                  symbol: selectedAccount.symbol ?? undefined,
                  tradeCurrency: selectedAccount.tradeCurrency ?? undefined,
                  debit: clearDebit ? undefined : currentBooking.debit,
                  credit: clearCredit ? undefined : currentBooking.credit,
                };

                form.setFieldValue(`bookings.${event.rowIndex}`, nextBooking);

                const rowNode = event.api.getRowNode(event.data.key);
                if (rowNode) {
                  rowNode.setData(nextBooking);
                }
              }
            }

            if (
              event.colDef.field === "debit" ||
              event.colDef.field === "credit"
            ) {
              form.setFieldValue(
                `bookings.${event.rowIndex}.${event.colDef.field === "credit" ? "debit" : "credit"}`,
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
              if (isSubmitting) return;
              const index = form.values.bookings.findIndex(
                (booking) => booking.key === key,
              );

              if (index === -1) {
                throw new Error("Booking not found");
              }

              form.removeListItem("bookings", index);
            },
            startDate: form.values.date,
            form,
            isSubmitting,
          }}
        />

        <Group justify="end">
          <Group>
            <Button variant="subtle" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              loading={isSubmitting}
              disabled={isSubmitting}
            >
              {submitLabel ?? (initialValues ? "Save" : "Create")}
            </Button>
          </Group>
        </Group>
      </Stack>
    </form>
  );
}
