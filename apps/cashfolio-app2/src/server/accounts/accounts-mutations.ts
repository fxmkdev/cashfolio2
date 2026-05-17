import { createServerFn } from "@tanstack/react-start";
import {
  assertRecord,
  requireArrayField,
  requireNumberField,
  requireStringField,
} from "../input-validation";
import { ensureAuthorizedAccountBookMutation } from "../mutation-guard.server";
import { invalidatePeriodBaseDataCacheForAccountBook } from "../period/period-base-data-cache";
import type { AccountGroupInput, AccountInput } from "./accounts-types";
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

function validateAccountMutationInput(data: unknown): AccountInput {
  assertRecord(data);
  requireStringField(data, "accountBookId", "Account book id is required.");
  return data as AccountInput;
}

function validateAccountUpdateInput(data: unknown): AccountInput & {
  id: string;
} {
  assertRecord(data);
  requireStringField(data, "id", "Account id is required.");
  requireStringField(data, "accountBookId", "Account book id is required.");
  return data as AccountInput & { id: string };
}

function validateAccountGroupMutationInput(data: unknown): AccountGroupInput {
  assertRecord(data);
  requireStringField(data, "accountBookId", "Account book id is required.");
  return data as AccountGroupInput;
}

function validateAccountGroupUpdateInput(data: unknown): AccountGroupInput & {
  id: string;
} {
  assertRecord(data);
  requireStringField(data, "id", "Account group id is required.");
  requireStringField(data, "accountBookId", "Account book id is required.");
  return data as AccountGroupInput & { id: string };
}

function validateAccountBookNodeIdInput(data: unknown): {
  id: string;
  accountBookId: string;
} {
  assertRecord(data);
  return {
    id: requireStringField(data, "id", "Node id is required."),
    accountBookId: requireStringField(
      data,
      "accountBookId",
      "Account book id is required.",
    ),
  };
}

function validateReorderAccountTreeItemsInput(data: unknown): {
  accountBookId: string;
  updates: {
    id: string;
    nodeType: "account" | "accountGroup";
    sortOrder: number;
  }[];
} {
  assertRecord(data);
  const accountBookId = requireStringField(
    data,
    "accountBookId",
    "Account book id is required.",
  );
  const updates = requireArrayField(data, "updates", "Updates are required.");

  return {
    accountBookId,
    updates: updates.map((update) => {
      assertRecord(update, "Reorder update must be an object.");
      const nodeType = update.nodeType;
      if (nodeType !== "account" && nodeType !== "accountGroup") {
        throw new Error("Node type is invalid.");
      }

      return {
        id: requireStringField(update, "id", "Node id is required."),
        nodeType,
        sortOrder: requireNumberField(
          update,
          "sortOrder",
          "Sort order is required.",
        ),
      };
    }),
  };
}

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
  .inputValidator(validateAccountMutationInput)
  .handler(async ({ data }) =>
    runAccountMutation(data.accountBookId, () => createAccountOperation(data)),
  );

export const updateAccount = createServerFn({ method: "POST" })
  .inputValidator(validateAccountUpdateInput)
  .handler(async ({ data }) =>
    runAccountMutation(data.accountBookId, () => updateAccountOperation(data)),
  );

export const createAccountGroup = createServerFn({ method: "POST" })
  .inputValidator(validateAccountGroupMutationInput)
  .handler(async ({ data }) =>
    runAccountMutation(data.accountBookId, () =>
      createAccountGroupOperation(data),
    ),
  );

export const updateAccountGroup = createServerFn({ method: "POST" })
  .inputValidator(validateAccountGroupUpdateInput)
  .handler(async ({ data }) =>
    runAccountMutation(data.accountBookId, () =>
      updateAccountGroupOperation(data),
    ),
  );

export const deleteAccount = createServerFn({ method: "POST" })
  .inputValidator(validateAccountBookNodeIdInput)
  .handler(async ({ data }) =>
    runAccountMutation(data.accountBookId, () => deleteAccountOperation(data)),
  );

export const deleteAccountGroup = createServerFn({ method: "POST" })
  .inputValidator(validateAccountBookNodeIdInput)
  .handler(async ({ data }) =>
    runAccountMutation(data.accountBookId, () =>
      deleteAccountGroupOperation(data),
    ),
  );

export const archiveAccount = createServerFn({ method: "POST" })
  .inputValidator(validateAccountBookNodeIdInput)
  .handler(async ({ data }) =>
    runAccountMutation(data.accountBookId, () => archiveAccountOperation(data)),
  );

export const archiveAccountGroup = createServerFn({ method: "POST" })
  .inputValidator(validateAccountBookNodeIdInput)
  .handler(async ({ data }) =>
    runAccountMutation(data.accountBookId, () =>
      archiveAccountGroupOperation(data),
    ),
  );

export const unarchiveAccount = createServerFn({ method: "POST" })
  .inputValidator(validateAccountBookNodeIdInput)
  .handler(async ({ data }) =>
    runAccountMutation(data.accountBookId, () =>
      unarchiveAccountOperation(data),
    ),
  );

export const unarchiveAccountGroup = createServerFn({ method: "POST" })
  .inputValidator(validateAccountBookNodeIdInput)
  .handler(async ({ data }) =>
    runAccountMutation(data.accountBookId, () =>
      unarchiveAccountGroupOperation(data),
    ),
  );

export const reorderAccountTreeItems = createServerFn({ method: "POST" })
  .inputValidator(validateReorderAccountTreeItemsInput)
  .handler(async ({ data }) =>
    runAccountMutation(data.accountBookId, () =>
      reorderAccountTreeItemsOperation(data),
    ),
  );
