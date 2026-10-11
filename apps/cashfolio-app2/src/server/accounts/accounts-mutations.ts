import { createServerFn } from "@tanstack/react-start";
import {
  validateAccountMutationInput,
  validateAccountUpdateInput,
  validateAccountGroupMutationInput,
  validateAccountGroupUpdateInput,
  validateAccountBookNodeIdInput,
  validateReorderAccountTreeItemsInput,
} from "./accounts-input-validation";
import { ensureAuthorizedAccountBookMutation } from "../mutation-guard.server";
import { invalidatePeriodBaseDataCacheForAccountBook } from "../period/cache/period-base-data-cache";
import {
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
  operation: () => Promise<AccountMutationOperationResult<T>>,
): Promise<T> {
  await ensureAuthorizedAccountBookMutation(accountBookId);
  const result = await operation();
  if (result.invalidatePeriodCache) {
    await invalidatePeriodBaseDataCacheForAccountBook(accountBookId);
  }
  return result.data;
}

export const createAccount = createServerFn({ method: "POST" })
  .validator(validateAccountMutationInput)
  .handler(async ({ data }) =>
    runAccountMutation(data.accountBookId, () => createAccountOperation(data)),
  );

export const updateAccount = createServerFn({ method: "POST" })
  .validator(validateAccountUpdateInput)
  .handler(async ({ data }) =>
    runAccountMutation(data.accountBookId, () => updateAccountOperation(data)),
  );

export const createAccountGroup = createServerFn({ method: "POST" })
  .validator(validateAccountGroupMutationInput)
  .handler(async ({ data }) =>
    runAccountMutation(data.accountBookId, () =>
      createAccountGroupOperation(data),
    ),
  );

export const updateAccountGroup = createServerFn({ method: "POST" })
  .validator(validateAccountGroupUpdateInput)
  .handler(async ({ data }) =>
    runAccountMutation(data.accountBookId, () =>
      updateAccountGroupOperation(data),
    ),
  );

export const deleteAccount = createServerFn({ method: "POST" })
  .validator(validateAccountBookNodeIdInput)
  .handler(async ({ data }) =>
    runAccountMutation(data.accountBookId, () => deleteAccountOperation(data)),
  );

export const deleteAccountGroup = createServerFn({ method: "POST" })
  .validator(validateAccountBookNodeIdInput)
  .handler(async ({ data }) =>
    runAccountMutation(data.accountBookId, () =>
      deleteAccountGroupOperation(data),
    ),
  );

export const archiveAccount = createServerFn({ method: "POST" })
  .validator(validateAccountBookNodeIdInput)
  .handler(async ({ data }) =>
    runAccountMutation(data.accountBookId, () => archiveAccountOperation(data)),
  );

export const archiveAccountGroup = createServerFn({ method: "POST" })
  .validator(validateAccountBookNodeIdInput)
  .handler(async ({ data }) =>
    runAccountMutation(data.accountBookId, () =>
      archiveAccountGroupOperation(data),
    ),
  );

export const unarchiveAccount = createServerFn({ method: "POST" })
  .validator(validateAccountBookNodeIdInput)
  .handler(async ({ data }) =>
    runAccountMutation(data.accountBookId, () =>
      unarchiveAccountOperation(data),
    ),
  );

export const unarchiveAccountGroup = createServerFn({ method: "POST" })
  .validator(validateAccountBookNodeIdInput)
  .handler(async ({ data }) =>
    runAccountMutation(data.accountBookId, () =>
      unarchiveAccountGroupOperation(data),
    ),
  );

export const reorderAccountTreeItems = createServerFn({ method: "POST" })
  .validator(validateReorderAccountTreeItemsInput)
  .handler(async ({ data }) =>
    runAccountMutation(data.accountBookId, () =>
      reorderAccountTreeItemsOperation(data),
    ),
  );
