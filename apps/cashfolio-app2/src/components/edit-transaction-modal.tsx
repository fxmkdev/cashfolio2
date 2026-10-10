import type { RowDragEndEvent } from "ag-grid-enterprise";
import type { AgGridReact } from "ag-grid-react";
import { Button, Group, Stack, TextInput, Tooltip } from "@mantine/core";
import { DateInput } from "@mantine/dates";
import { formRootRule, isNotEmpty, useForm } from "@mantine/form";
import { IconInfoCircle, IconTablePlus } from "@tabler/icons-react";
import { createId } from "@paralleldrive/cuid2";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Unit } from "../.prisma-client/enums";
import { useDialogSubmitState } from "../hooks/use-dialog-submit-state";
import type { AccountBookUnitUsage } from "../shared/account-book-unit-usage";
import { isExpenseAccount, isIncomeAccount } from "../shared/account-utils";
import {
  formatUtcDateForLocale,
  getDateInputValueFormat,
  normalizeDateInputValue,
  normalizeDateInputValueToUtcDay,
  startOfUtcDay,
} from "../shared/date";
import { useUserLocale } from "@/user-locale-context";
import { DataGrid } from "./data-grid";
import {
  createEditTransactionColumnDefs,
  isEditableCell,
} from "./edit-transaction-modal-columns";
import { createBookingUnitDefaults } from "./edit-transaction-modal-unit-defaults";
import { validateEditTransactionBookingsRoot } from "./edit-transaction-modal-validation";
import type {
  AccountOption,
  BookingValues,
} from "./edit-transaction-modal-types";
import {
  createTransactionFormInitialValues,
  toTransactionSubmitBookings,
} from "./edit-transaction-modal-values";
import { getNumberFormatSymbols } from "./formatted-number-input";
import { isTransactionFormDirty } from "./edit-transaction-modal-dirty-state";

export type {
  AccountOption,
  BookingValues,
  TransactionFormValues,
} from "./edit-transaction-modal-types";

export function EditTransactionModal({
  initialValues,
  submitLabel,
  accounts,
  accountBookStartDate,
  unitUsage,
  currentAccountId,
  autoFocusDate,
  preserveBookingUnitOnUnitlessEquityAccountChange,
  onClose,
  onSubmittingChange,
  onDirtyChange,
  onSubmit,
}: {
  initialValues?: {
    description?: string;
    bookings?: Omit<BookingValues, "key">[];
  };
  submitLabel?: string;
  accounts: AccountOption[];
  accountBookStartDate: Date;
  unitUsage?: AccountBookUnitUsage;
  currentAccountId?: string;
  autoFocusDate?: boolean;
  preserveBookingUnitOnUnitlessEquityAccountChange?: boolean;
  onClose: () => void;
  onSubmittingChange?: (isSubmitting: boolean) => void;
  onDirtyChange?: (isDirty: boolean) => void;
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
  const userLocale = useUserLocale();
  const { thousandSeparator, decimalSeparator } =
    getNumberFormatSymbols(userLocale);
  const { isSubmitting, runSubmit } = useDialogSubmitState({
    onSubmittingChange,
  });
  const accountBookStartDay = startOfUtcDay(accountBookStartDate);
  const accountBookStartDateLabel = formatUtcDateForLocale(
    accountBookStartDay,
    userLocale,
  );
  const currentAccount = accounts.find((a) => a.value === currentAccountId);
  const [isFormDirty, setIsFormDirty] = useState(false);
  const [isCellEditorDirty, setIsCellEditorDirty] = useState(false);
  const [isDateInputDirty, setIsDateInputDirty] = useState(false);

  const form = useForm({
    mode: "uncontrolled",
    initialValues: createTransactionFormInitialValues({
      initialValues,
      currentAccountId,
      currentAccount,
    }),
    onValuesChange: ({ date }, { date: previousDate }) => {
      setIsFormDirty(
        isTransactionFormDirty(
          form.getValues(),
          form.getInitialValues(),
          userLocale,
        ),
      );
      if (
        normalizeDateInputValueToUtcDay(date, userLocale)?.getTime() !==
        normalizeDateInputValueToUtcDay(previousDate, userLocale)?.getTime()
      ) {
        const normalizedDate = normalizeDateInputValue(date, userLocale);
        if (date != null && normalizedDate == null) return;
        for (let i = 0; i < form.values.bookings.length; i++) {
          form.setFieldValue(`bookings.${i}.date`, normalizedDate ?? undefined);
        }
      }
    },
    validate: {
      date: (value) => {
        const date = normalizeDateInputValueToUtcDay(value, userLocale);
        if (!date) {
          return value ? "Date is invalid" : "Date is required";
        }
        if (startOfUtcDay(date) < accountBookStartDay) {
          return `Date cannot be before account book start date (${accountBookStartDateLabel}).`;
        }
        return null;
      },
      bookings: {
        [formRootRule]: (bookings) =>
          validateEditTransactionBookingsRoot({
            bookings,
            accounts,
            thousandSeparator,
            decimalSeparator,
          }),
        date: (value) => {
          const bookingDate = normalizeDateInputValueToUtcDay(
            value,
            userLocale,
          );
          if (!bookingDate) {
            return value ? "Date is invalid" : "Date is required";
          }
          if (startOfUtcDay(bookingDate) < accountBookStartDay) {
            return `Date cannot be before account book start date (${accountBookStartDateLabel}).`;
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
  // AG Grid mutates rows when committing a cell. Keep those rows separate from
  // Mantine's values and initial-value snapshot so dirty checks stay accurate.
  const bookingRows = useMemo(
    () => form.values.bookings.map((booking) => ({ ...booking })),
    [form.values.bookings],
  );

  useEffect(() => {
    onDirtyChange?.(isFormDirty || isCellEditorDirty || isDateInputDirty);
  }, [isFormDirty, isCellEditorDirty, isDateInputDirty, onDirtyChange]);

  function onAdd() {
    const newRow = {
      date: normalizeDateInputValue(form.values.date) ?? undefined,
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
    if (!currentAccountId) return undefined;
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
        accountBookStartDate: accountBookStartDay,
        unitUsage,
      }),
    [accountBookStartDay, accounts, isSubmitting, unitUsage],
  );

  useEffect(() => {
    form.validateField("bookings");
  }, [form, form.values.bookings]);

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
            onInput={(event) => {
              const input = event.currentTarget.value;
              const date = normalizeDateInputValueToUtcDay(input, userLocale);
              const initialDate = normalizeDateInputValueToUtcDay(
                form.getInitialValues().date,
                userLocale,
              );
              setIsDateInputDirty(
                date?.getTime() !== initialDate?.getTime() ||
                  (input !== "" && !date),
              );
            }}
            valueFormat={getDateInputValueFormat(userLocale)}
            dateParser={(value) => normalizeDateInputValue(value, userLocale)}
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
            minDate={accountBookStartDay}
            data-autofocus={autoFocusDate || undefined}
            {...form.getInputProps("date")}
            onChange={(nextDate) => {
              setIsDateInputDirty(false);
              form.getInputProps("date").onChange(nextDate);
            }}
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
            Add Booking
          </Button>
        </Group>
        <DataGrid
          ref={gridRef}
          containerStyle={{
            height: `calc(100vh - 30.5rem)`,
          }}
          rowData={bookingRows}
          getRowId={({ data }) => data.key}
          columnDefs={columnDefs}
          rowDragManaged
          animateRows
          suppressMovableColumns
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
                const lockedBooking = form.values.bookings.find(
                  (booking) => booking.key === lockedBookingKey,
                );
                const bookingUnitDefaults = createBookingUnitDefaults({
                  selectedAccount,
                  lockedBooking,
                  currentBooking,
                  preserveCurrentBookingUnitForUnitlessEquity:
                    preserveBookingUnitOnUnitlessEquityAccountChange,
                });

                const nextBooking: BookingValues = {
                  ...currentBooking,
                  account: event.newValue ?? undefined,
                  date: currentBooking.date,
                  ...bookingUnitDefaults,
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
            onCellEditorDirtyChange: setIsCellEditorDirty,
            status: form.errors.bookings ?? null,
            deleteDisabled: form.values.bookings.length <= 2,
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
            accountBookStartDate: accountBookStartDay,
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
