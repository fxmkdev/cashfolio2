import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgGridReact } from "ag-grid-react";
import type {
  CellValueChangedEvent,
  GridApi,
  RowDragEndEvent,
} from "ag-grid-enterprise";
import { createEditTransactionColumnDefs } from "../edit-transaction-modal-columns";
import type {
  BookingValues,
  EditTransactionModalProps,
  TransactionForm,
} from "../edit-transaction-modal-types";
import {
  addBooking,
  changeBookingCell,
  deleteBooking,
  reorderBookingRows,
} from "./grid-events";

export async function stopBookingEditing(
  api?: Pick<
    GridApi<BookingValues>,
    | "getEditingCells"
    | "stopEditing"
    | "addEventListener"
    | "removeEventListener"
  >,
) {
  if (!api || api.getEditingCells().length === 0) return;
  // AG Grid queues cell-value changes before cellEditingStopped. Wait for those
  // handlers to update the uncontrolled form before validating its values.
  await new Promise<void>((resolve) => {
    const onStopped = () => {
      api.removeEventListener("cellEditingStopped", onStopped);
      resolve();
    };
    api.addEventListener("cellEditingStopped", onStopped);
    api.stopEditing();
  });
}

export function useEditTransactionGrid(args: {
  form: TransactionForm;
  accounts: EditTransactionModalProps["accounts"];
  currentAccountId?: string;
  unitUsage: EditTransactionModalProps["unitUsage"];
  accountBookStartDay: Date;
  isSubmitting: boolean;
}) {
  const {
    form,
    accounts,
    currentAccountId,
    unitUsage,
    accountBookStartDay,
    isSubmitting,
  } = args;
  const gridRef = useRef<AgGridReact<BookingValues>>(null);
  const pendingCommit = useRef<Promise<void> | null>(null);
  const [isCellEditorDirty, setIsCellEditorDirty] = useState(false);
  // AG Grid mutates committed rows; never share them with the form snapshot.
  const bookingRows = useMemo(
    () => form.values.bookings.map((booking) => ({ ...booking })),
    [form.values.bookings],
  );
  const lockedBookingKey = useMemo(
    () =>
      currentAccountId
        ? form.values.bookings.find(
            (booking) => booking.account === currentAccountId,
          )?.key
        : undefined,
    [form.values.bookings, currentAccountId],
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
  const onRowDragEnd = useCallback(
    (event: RowDragEndEvent<BookingValues>) => reorderBookingRows(form, event),
    [form],
  );

  useEffect(() => {
    form.validateField("bookings");
  }, [form, form.values.bookings]);

  return {
    gridRef,
    stopEditing: () => {
      // Repeated submits must wait for the same in-flight edit commit.
      pendingCommit.current ??= stopBookingEditing(
        gridRef.current?.api,
      ).finally(() => {
        pendingCommit.current = null;
      });
      return pendingCommit.current;
    },
    bookingRows,
    columnDefs,
    isCellEditorDirty,
    onRowDragEnd,
    onAdd: () => addBooking(form, gridRef.current?.api),
    onCellValueChanged: (event: CellValueChangedEvent<BookingValues>) =>
      changeBookingCell({ form, accounts, lockedBookingKey, event }),
    context: {
      onCellEditorDirtyChange: setIsCellEditorDirty,
      status: form.errors.bookings ?? null,
      deleteDisabled: form.values.bookings.length <= 2,
      lockedBookingKey,
      onDelete: (key: string) => deleteBooking(form, key, isSubmitting),
      startDate: form.values.date,
      accountBookStartDate: accountBookStartDay,
      form,
      isSubmitting,
    },
  };
}
