import { Unit } from "../../.prisma-client/enums";
import { parseUtcDayDate } from "../../shared/date";
import {
  assertRecord,
  optionalField,
  requireArrayField,
  requireEnumField,
  requireNumberField,
  requireStringField,
  requireTextField,
} from "../input-validation";
import type {
  CreateSimpleTransactionInput,
  CreateTransactionInput,
  CreateTransactionsInput,
  RebookBookingInput,
} from "./transactions-types";

function readBookingDate(
  data: Record<string, unknown>,
  message: string,
): string {
  const date = requireStringField(data, "date", message);
  if (!parseUtcDayDate(date)) {
    throw new Error(message);
  }
  return date;
}

function readBooking(
  data: unknown,
  index: number,
): CreateTransactionInput["bookings"][number] {
  assertRecord(data, `Booking ${index}: must be an object.`);
  const unit = requireEnumField(
    data,
    "unit",
    Object.values(Unit),
    `Booking ${index}: unit is invalid.`,
  );
  return {
    date: readBookingDate(
      data,
      `Booking ${index}: date must be a valid UTC day.`,
    ),
    accountId: requireStringField(
      data,
      "accountId",
      `Booking ${index}: account is required.`,
    ),
    description: requireTextField(data, "description"),
    unit,
    currency:
      unit === Unit.CURRENCY
        ? requireStringField(
            data,
            "currency",
            `Booking ${index}: currency is required.`,
          )
        : optionalField(data, "currency", requireTextField),
    cryptocurrency:
      unit === Unit.CRYPTOCURRENCY
        ? requireStringField(
            data,
            "cryptocurrency",
            `Booking ${index}: cryptocurrency is required.`,
          )
        : optionalField(data, "cryptocurrency", requireTextField),
    symbol:
      unit === Unit.SECURITY
        ? requireStringField(
            data,
            "symbol",
            `Booking ${index}: symbol and trade currency are required for security bookings.`,
          )
        : optionalField(data, "symbol", requireTextField),
    tradeCurrency:
      unit === Unit.SECURITY
        ? requireStringField(
            data,
            "tradeCurrency",
            `Booking ${index}: symbol and trade currency are required for security bookings.`,
          )
        : optionalField(data, "tradeCurrency", requireTextField),
    value: requireNumberField(
      data,
      "value",
      `Booking ${index}: value must be finite.`,
    ),
  };
}

function readTransaction(
  data: unknown,
): Omit<CreateTransactionInput, "accountBookId"> {
  assertRecord(data, "Transaction must be an object.");
  return {
    description: requireTextField(data, "description"),
    bookings: Array.from(
      requireArrayField(data, "bookings", "Bookings are required."),
      readBooking,
    ),
  };
}

export function validateCreateTransactionInput(
  data: unknown,
): CreateTransactionInput {
  assertRecord(data);
  const accountBookId = requireStringField(
    data,
    "accountBookId",
    "Account book id is required.",
  );
  return { accountBookId, ...readTransaction(data) };
}

export function validateCreateTransactionsInput(
  data: unknown,
): CreateTransactionsInput {
  assertRecord(data);
  return {
    accountBookId: requireStringField(
      data,
      "accountBookId",
      "Account book id is required.",
    ),
    transactions: Array.from(
      requireArrayField(data, "transactions", "Transactions are required."),
      readTransaction,
    ),
  };
}

export function validateUpdateTransactionInput(
  data: unknown,
): CreateTransactionInput & { transactionId: string } {
  assertRecord(data);
  const transactionId = requireStringField(
    data,
    "transactionId",
    "Transaction id is required.",
  );
  return { ...validateCreateTransactionInput(data), transactionId };
}

export function validateCreateSimpleTransactionInput(
  data: unknown,
): CreateSimpleTransactionInput {
  assertRecord(data);
  return {
    accountBookId: requireStringField(
      data,
      "accountBookId",
      "Account book id is required.",
    ),
    accountId: requireStringField(data, "accountId", "Account id is required."),
    counterAccountId: requireStringField(
      data,
      "counterAccountId",
      "Counter account id is required.",
    ),
    date: readBookingDate(data, "Date must be a valid UTC day."),
    description: requireTextField(data, "description"),
    amount: requireNumberField(data, "amount", "Amount is required."),
    direction: requireEnumField(
      data,
      "direction",
      ["DEBIT", "CREDIT"] as const,
      "Direction must be either DEBIT or CREDIT.",
    ),
  };
}

export function validateRebookBookingInput(data: unknown): RebookBookingInput {
  assertRecord(data);
  return {
    accountBookId: requireStringField(
      data,
      "accountBookId",
      "Account book id is required.",
    ),
    bookingId: requireStringField(data, "bookingId", "Booking id is required."),
    targetAccountId: requireStringField(
      data,
      "targetAccountId",
      "Target account id is required.",
    ),
  };
}

export function validateDeleteTransactionInput(data: unknown): {
  transactionId: string;
  accountBookId: string;
} {
  assertRecord(data);
  return {
    transactionId: requireStringField(
      data,
      "transactionId",
      "Transaction id is required.",
    ),
    accountBookId: requireStringField(
      data,
      "accountBookId",
      "Account book id is required.",
    ),
  };
}
