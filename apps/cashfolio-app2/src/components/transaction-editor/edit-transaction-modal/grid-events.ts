import { createId } from "@paralleldrive/cuid2";
import type {
  CellValueChangedEvent,
  GridApi,
  RowDragEndEvent,
} from "ag-grid-enterprise";
import { Unit } from "@/.prisma-client/enums";
import {
  isExpenseAccount,
  isIncomeAccount,
} from "@/shared/accounts/account-utils";
import { normalizeDateInputValue } from "@/shared/date";
import { createBookingUnitDefaults } from "../edit-transaction-modal-unit-defaults";
import type {
  BookingValues,
  EditTransactionModalProps,
  TransactionForm,
} from "../edit-transaction-modal-types";

type CellChangeArgs = {
  form: TransactionForm;
  accounts: EditTransactionModalProps["accounts"];
  lockedBookingKey?: string;
  event: CellValueChangedEvent<BookingValues>;
};

function applyAccountSelection(
  { form, accounts, lockedBookingKey, event }: CellChangeArgs,
  rowIndex: number,
) {
  const currentBooking = form.values.bookings[rowIndex];
  if (!currentBooking) return;
  const selectedAccount = accounts.find(
    (account) => account.value === event.newValue,
  );
  if (!selectedAccount) return;
  const lockedBooking = form.values.bookings.find(
    (booking) => booking.key === lockedBookingKey,
  );
  const nextBooking: BookingValues = {
    ...currentBooking,
    account: event.newValue ?? undefined,
    date: currentBooking.date,
    ...createBookingUnitDefaults({
      selectedAccount,
      lockedBooking,
      currentBooking,
    }),
    debit: isIncomeAccount(selectedAccount) ? undefined : currentBooking.debit,
    credit: isExpenseAccount(selectedAccount)
      ? undefined
      : currentBooking.credit,
  };
  form.setFieldValue(`bookings.${rowIndex}`, nextBooking);
  event.api.getRowNode(event.data.key)?.setData(nextBooking);
}

function currencyField(unit: Unit | undefined) {
  switch (unit) {
    case Unit.CURRENCY:
      return "currency";
    case Unit.CRYPTOCURRENCY:
      return "cryptocurrency";
    case Unit.SECURITY:
      return "tradeCurrency";
  }
}

export function changeBookingCell(args: CellChangeArgs) {
  const { form, event } = args;
  const index = event.rowIndex;
  if (index == null) return;
  if (event.colDef.colId === "ccy") {
    const field = currencyField(form.values.bookings[index]?.unit);
    if (field) form.setFieldValue(`bookings.${index}.${field}`, event.newValue);
  } else {
    form.setFieldValue(
      `bookings.${index}.${event.colDef.field}`,
      event.newValue,
    );
  }
  if (event.colDef.field === "account") applyAccountSelection(args, index);
  if (event.colDef.field === "debit" || event.colDef.field === "credit") {
    form.setFieldValue(
      `bookings.${index}.${event.colDef.field === "credit" ? "debit" : "credit"}`,
      undefined,
    );
  }
}

export function reorderBookingRows(
  form: TransactionForm,
  event: RowDragEndEvent<BookingValues>,
) {
  const keys: string[] = [];
  event.api.forEachNodeAfterFilterAndSort((node) => {
    if (node.data?.key) keys.push(node.data.key);
  });
  if (keys.length !== form.values.bookings.length) return;
  const currentKeys = form.values.bookings.map((booking) => booking.key);
  if (!currentKeys.every((key) => keys.includes(key))) return;
  if (!keys.some((key, index) => key !== currentKeys[index])) return;
  const bookingByKey = new Map(
    form.values.bookings.map((booking) => [booking.key, booking]),
  );
  const bookings = keys
    .map((key) => bookingByKey.get(key))
    .filter((booking): booking is BookingValues => Boolean(booking));
  if (bookings.length !== form.values.bookings.length) return;
  form.setFieldValue("bookings", bookings);
}

export function addBooking(
  form: TransactionForm,
  api?: Pick<GridApi<BookingValues>, "applyTransaction" | "ensureIndexVisible">,
) {
  const booking: BookingValues = {
    date: normalizeDateInputValue(form.values.date) ?? undefined,
    account: "",
    description: "",
    key: createId(),
  };
  const result = api?.applyTransaction({ add: [booking] });
  api?.ensureIndexVisible(result?.add[0].rowIndex ?? 0, "bottom");
  form.insertListItem("bookings", booking);
}

export function deleteBooking(
  form: TransactionForm,
  key: string,
  isSubmitting: boolean,
) {
  if (isSubmitting) return;
  const index = form.values.bookings.findIndex(
    (booking) => booking.key === key,
  );
  if (index === -1) throw new Error("Booking not found");
  form.removeListItem("bookings", index);
}
