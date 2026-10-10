import type { Prisma } from "../../.prisma-client/client";
import { withAccountBookMutation } from "../account-book-mutation.server";
import { createServerFn } from "@tanstack/react-start";
import {
  assertRecord,
  requireArrayField,
  requireNumberField,
  requireStringField,
} from "../input-validation";
import { ensureAuthorizedAccountBookMutation } from "../mutation-guard.server";
import { invalidatePeriodBaseDataCacheForAccountBook } from "../period/period-base-data-cache";
import {
  createSimpleTransactionOperation,
  createTransactionOperation,
  createTransactionsOperation,
  deleteTransactionOperation,
  rebookBookingOperation,
  updateTransactionOperation,
  type TransactionMutationOperationResult,
} from "./transactions-mutation-operations";
import type {
  CreateSimpleTransactionInput,
  CreateTransactionInput,
  CreateTransactionsInput,
  RebookBookingInput,
} from "./transactions-types";

function validateCreateTransactionInput(data: unknown): CreateTransactionInput {
  assertRecord(data);
  requireStringField(data, "accountBookId", "Account book id is required.");
  requireArrayField(data, "bookings", "Bookings are required.");
  return data as CreateTransactionInput;
}

function validateCreateTransactionsInput(
  data: unknown,
): CreateTransactionsInput {
  assertRecord(data);
  requireStringField(data, "accountBookId", "Account book id is required.");
  requireArrayField(data, "transactions", "Transactions are required.");
  return data as CreateTransactionsInput;
}

function validateUpdateTransactionInput(
  data: unknown,
): CreateTransactionInput & {
  transactionId: string;
} {
  assertRecord(data);
  requireStringField(data, "transactionId", "Transaction id is required.");
  requireStringField(data, "accountBookId", "Account book id is required.");
  requireArrayField(data, "bookings", "Bookings are required.");
  return data as CreateTransactionInput & { transactionId: string };
}

function validateCreateSimpleTransactionInput(
  data: unknown,
): CreateSimpleTransactionInput {
  assertRecord(data);
  requireStringField(data, "accountBookId", "Account book id is required.");
  requireStringField(data, "accountId", "Account id is required.");
  requireStringField(
    data,
    "counterAccountId",
    "Counter account id is required.",
  );
  requireStringField(data, "date", "Date is required.");
  requireNumberField(data, "amount", "Amount is required.");
  return data as CreateSimpleTransactionInput;
}

function validateRebookBookingInput(data: unknown): RebookBookingInput {
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

function validateDeleteTransactionInput(data: unknown): {
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

async function runTransactionMutation<T>(
  accountBookId: string,
  operation: (
    tx: Prisma.TransactionClient,
  ) => Promise<TransactionMutationOperationResult<T>>,
): Promise<T> {
  await ensureAuthorizedAccountBookMutation(accountBookId);
  const result = await withAccountBookMutation(accountBookId, operation);
  if (result.invalidatePeriodCache) {
    await invalidatePeriodBaseDataCacheForAccountBook(accountBookId);
  }
  return result.data;
}

export const updateTransaction = createServerFn({ method: "POST" })
  .inputValidator(validateUpdateTransactionInput)
  .handler(async ({ data }) =>
    runTransactionMutation(data.accountBookId, (tx) =>
      updateTransactionOperation(data, tx),
    ),
  );

export const createTransaction = createServerFn({ method: "POST" })
  .inputValidator(validateCreateTransactionInput)
  .handler(async ({ data }) =>
    runTransactionMutation(data.accountBookId, (tx) =>
      createTransactionOperation(data, tx),
    ),
  );

export const createTransactions = createServerFn({ method: "POST" })
  .inputValidator(validateCreateTransactionsInput)
  .handler(async ({ data }) =>
    runTransactionMutation(data.accountBookId, (tx) =>
      createTransactionsOperation(data, tx),
    ),
  );

export const createSimpleTransaction = createServerFn({ method: "POST" })
  .inputValidator(validateCreateSimpleTransactionInput)
  .handler(async ({ data }) =>
    runTransactionMutation(data.accountBookId, (tx) =>
      createSimpleTransactionOperation(data, tx),
    ),
  );

export const rebookBooking = createServerFn({ method: "POST" })
  .inputValidator(validateRebookBookingInput)
  .handler(async ({ data }) =>
    runTransactionMutation(data.accountBookId, (tx) =>
      rebookBookingOperation(data, tx),
    ),
  );

export const deleteTransaction = createServerFn({ method: "POST" })
  .inputValidator(validateDeleteTransactionInput)
  .handler(async ({ data }) =>
    runTransactionMutation(data.accountBookId, (tx) =>
      deleteTransactionOperation(data, tx),
    ),
  );
