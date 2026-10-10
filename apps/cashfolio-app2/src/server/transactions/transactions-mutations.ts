import type { Prisma } from "../../.prisma-client/client";
import { withAccountBookMutation } from "../account-book-mutation.server";
import { createServerFn } from "@tanstack/react-start";
import {
  validateCreateTransactionInput,
  validateCreateTransactionsInput,
  validateUpdateTransactionInput,
  validateCreateSimpleTransactionInput,
  validateRebookBookingInput,
  validateDeleteTransactionInput,
} from "./transactions-input-validation";
import { ensureAuthorizedAccountBookMutation } from "../mutation-guard.server";
import { withDatabaseConflictRetry } from "../database-conflict-retry";
import { invalidatePeriodBaseDataCacheForAccountBook } from "../period/cache/period-base-data-cache";
import {
  createSimpleTransactionOperation,
  createTransactionOperation,
  createTransactionsOperation,
  deleteTransactionOperation,
  rebookBookingOperation,
  updateTransactionOperation,
  type TransactionMutationOperationResult,
} from "./transactions-mutation-operations";

async function runTransactionMutation<T>(
  accountBookId: string,
  operation: (
    tx: Prisma.TransactionClient,
  ) => Promise<TransactionMutationOperationResult<T>>,
): Promise<T> {
  await ensureAuthorizedAccountBookMutation(accountBookId);
  const result = await withDatabaseConflictRetry(() =>
    withAccountBookMutation(accountBookId, operation),
  );
  if (result.invalidatePeriodCache) {
    await invalidatePeriodBaseDataCacheForAccountBook(accountBookId);
  }
  return result.data;
}

export const updateTransaction = createServerFn({ method: "POST" })
  .validator(validateUpdateTransactionInput)
  .handler(async ({ data }) =>
    runTransactionMutation(data.accountBookId, (tx) =>
      updateTransactionOperation(data, tx),
    ),
  );

export const createTransaction = createServerFn({ method: "POST" })
  .validator(validateCreateTransactionInput)
  .handler(async ({ data }) =>
    runTransactionMutation(data.accountBookId, (tx) =>
      createTransactionOperation(data, tx),
    ),
  );

export const createTransactions = createServerFn({ method: "POST" })
  .validator(validateCreateTransactionsInput)
  .handler(async ({ data }) =>
    runTransactionMutation(data.accountBookId, (tx) =>
      createTransactionsOperation(data, tx),
    ),
  );

export const createSimpleTransaction = createServerFn({ method: "POST" })
  .validator(validateCreateSimpleTransactionInput)
  .handler(async ({ data }) =>
    runTransactionMutation(data.accountBookId, (tx) =>
      createSimpleTransactionOperation(data, tx),
    ),
  );

export const rebookBooking = createServerFn({ method: "POST" })
  .validator(validateRebookBookingInput)
  .handler(async ({ data }) =>
    runTransactionMutation(data.accountBookId, (tx) =>
      rebookBookingOperation(data, tx),
    ),
  );

export const deleteTransaction = createServerFn({ method: "POST" })
  .validator(validateDeleteTransactionInput)
  .handler(async ({ data }) =>
    runTransactionMutation(data.accountBookId, (tx) =>
      deleteTransactionOperation(data, tx),
    ),
  );
