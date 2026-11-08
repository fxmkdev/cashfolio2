import { vi } from "vitest";
import type {
  BookingValues,
  TransactionForm,
  TransactionFormValues,
} from "../edit-transaction-modal-types";

/** The event handlers need only this small, synchronous form boundary. */
export function createFormFixture(values: TransactionFormValues) {
  const initialValues = structuredClone(values);
  const setFieldValue = vi.fn((path: string, value: unknown) => {
    const [, index, field] = path.split(".");
    if (path === "bookings") values.bookings = value as BookingValues[];
    else if (field)
      Object.assign(values.bookings[Number(index)], { [field]: value });
    else values.bookings[Number(index)] = value as BookingValues;
  });
  const insertListItem = vi.fn();
  const removeListItem = vi.fn();
  const form = {
    values,
    errors: {},
    setFieldValue,
    insertListItem,
    removeListItem,
    getValues: () => values,
    getInitialValues: () => initialValues,
  } as unknown as TransactionForm;
  return { form, setFieldValue, insertListItem, removeListItem };
}
