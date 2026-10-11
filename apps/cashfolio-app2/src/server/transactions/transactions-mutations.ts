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

async function runTransactionMutation<T>(
  accountBookId: string,
  operation: () => Promise<TransactionMutationOperationResult<T>>,
): Promise<T> {
  await ensureAuthorizedAccountBookMutation(accountBookId);
  const result = await operation();
  if (result.invalidatePeriodCache) {
    await invalidatePeriodBaseDataCacheForAccountBook(accountBookId);
  }
  return result.data;
}

export const updateTransaction = createServerFn({ method: "POST" })
  .validator(validateUpdateTransactionInput)
  .handler(async ({ data }) =>
    runTransactionMutation(data.accountBookId, () =>
      updateTransactionOperation(data),
    ),
  );

export const createTransaction = createServerFn({ method: "POST" })
  .validator(validateCreateTransactionInput)
  .handler(async ({ data }) =>
    runTransactionMutation(data.accountBookId, () =>
      createTransactionOperation(data),
    ),
  );

export const createTransactions = createServerFn({ method: "POST" })
  .validator(validateCreateTransactionsInput)
  .handler(async ({ data }) =>
    runTransactionMutation(data.accountBookId, () =>
      createTransactionsOperation(data),
    ),
  );

export const createSimpleTransaction = createServerFn({ method: "POST" })
  .validator(validateCreateSimpleTransactionInput)
  .handler(async ({ data }) =>
    runTransactionMutation(data.accountBookId, () =>
      createSimpleTransactionOperation(data),
    ),
  );

export const rebookBooking = createServerFn({ method: "POST" })
  .validator(validateRebookBookingInput)
  .handler(async ({ data }) =>
    runTransactionMutation(data.accountBookId, () =>
      rebookBookingOperation(data),
    ),
  );

export const deleteTransaction = createServerFn({ method: "POST" })
  .validator(validateDeleteTransactionInput)
  .handler(async ({ data }) =>
    runTransactionMutation(data.accountBookId, () =>
      deleteTransactionOperation(data),
    ),
  );
