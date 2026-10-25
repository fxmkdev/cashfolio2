import type { Prisma } from "../../.prisma-client/client";
import { withAccountBookMutation } from "../account-book-mutation.server";
import { createServerFn } from "@tanstack/react-start";
import {
  validateSetAccountsAssetClassInput,
  validateMoveAccountsInput,
  validateAccountMutationInput,
  validateAccountUpdateInput,
  validateAccountGroupMutationInput,
  validateAccountGroupUpdateInput,
  validateAccountBookNodeIdInput,
  validateReorderAccountTreeItemsInput,
} from "./accounts-input-validation";
import { ensureAuthorizedAccountBookMutation } from "../mutation-guard.server";
import { withDatabaseConflictRetry } from "../database-conflict-retry";
import { invalidatePeriodBaseDataCacheForAccountBook } from "../period/cache/period-base-data-cache";
import {
  setAccountsAssetClassOperation,
  moveAccountsOperation,
  archiveAccountGroupOperation,
  archiveAccountOperation,
  createAccountGroupOperation,
  createAccountOperation,
  deleteAccountGroupOperation,
  deleteAccountOperation,
  reorderAccountTreeItemsOperation,
  unarchiveAccountGroupOperation,
  unarchiveAccountOperation,
  updateAccountGroupOperation,
  updateAccountOperation,
  type AccountMutationOperationResult,
} from "./accounts-mutation-operations";

async function runAccountMutation<T>(
  accountBookId: string,
  operation: (
    tx: Prisma.TransactionClient,
  ) => Promise<AccountMutationOperationResult<T>>,
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

export const createAccount = createServerFn({ method: "POST" })
  .validator(validateAccountMutationInput)
  .handler(async ({ data }) =>
    runAccountMutation(data.accountBookId, (tx) =>
      createAccountOperation(data, tx),
    ),
  );

export const updateAccount = createServerFn({ method: "POST" })
  .validator(validateAccountUpdateInput)
  .handler(async ({ data }) =>
    runAccountMutation(data.accountBookId, (tx) =>
      updateAccountOperation(data, tx),
    ),
  );

export const createAccountGroup = createServerFn({ method: "POST" })
  .validator(validateAccountGroupMutationInput)
  .handler(async ({ data }) =>
    runAccountMutation(data.accountBookId, (tx) =>
      createAccountGroupOperation(data, tx),
    ),
  );

export const updateAccountGroup = createServerFn({ method: "POST" })
  .validator(validateAccountGroupUpdateInput)
  .handler(async ({ data }) =>
    runAccountMutation(data.accountBookId, (tx) =>
      updateAccountGroupOperation(data, tx),
    ),
  );

export const deleteAccount = createServerFn({ method: "POST" })
  .validator(validateAccountBookNodeIdInput)
  .handler(async ({ data }) =>
    runAccountMutation(data.accountBookId, (tx) =>
      deleteAccountOperation(data, tx),
    ),
  );

export const deleteAccountGroup = createServerFn({ method: "POST" })
  .validator(validateAccountBookNodeIdInput)
  .handler(async ({ data }) =>
    runAccountMutation(data.accountBookId, (tx) =>
      deleteAccountGroupOperation(data, tx),
    ),
  );

export const archiveAccount = createServerFn({ method: "POST" })
  .validator(validateAccountBookNodeIdInput)
  .handler(async ({ data }) =>
    runAccountMutation(data.accountBookId, (tx) =>
      archiveAccountOperation(data, tx),
    ),
  );

export const archiveAccountGroup = createServerFn({ method: "POST" })
  .validator(validateAccountBookNodeIdInput)
  .handler(async ({ data }) =>
    runAccountMutation(data.accountBookId, (tx) =>
      archiveAccountGroupOperation(data, tx),
    ),
  );

export const unarchiveAccount = createServerFn({ method: "POST" })
  .validator(validateAccountBookNodeIdInput)
  .handler(async ({ data }) =>
    runAccountMutation(data.accountBookId, (tx) =>
      unarchiveAccountOperation(data, tx),
    ),
  );

export const unarchiveAccountGroup = createServerFn({ method: "POST" })
  .validator(validateAccountBookNodeIdInput)
  .handler(async ({ data }) =>
    runAccountMutation(data.accountBookId, (tx) =>
      unarchiveAccountGroupOperation(data, tx),
    ),
  );

export const reorderAccountTreeItems = createServerFn({ method: "POST" })
  .validator(validateReorderAccountTreeItemsInput)
  .handler(async ({ data }) =>
    runAccountMutation(data.accountBookId, (tx) =>
      reorderAccountTreeItemsOperation(data, tx),
    ),
  );

export const setAccountsAssetClass = createServerFn({ method: "POST" })
  .validator(validateSetAccountsAssetClassInput)
  .handler(async ({ data }) =>
    runAccountMutation(data.accountBookId, (tx) =>
      setAccountsAssetClassOperation(data, tx),
    ),
  );

export const moveAccounts = createServerFn({ method: "POST" })
  .validator(validateMoveAccountsInput)
  .handler(async ({ data }) =>
    runAccountMutation(data.accountBookId, (tx) =>
      moveAccountsOperation(data, tx),
    ),
  );
