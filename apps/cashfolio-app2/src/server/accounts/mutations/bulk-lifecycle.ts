import { createServerFn } from "@tanstack/react-start";
import { ensureAuthorizedAccountBookMutation } from "../../mutation-guard.server";
import { withAccountBookMutation } from "../../account-book-mutation.server";
import { withDatabaseConflictRetry } from "../../database-conflict-retry";
import { invalidatePeriodBaseDataCacheForAccountBook } from "../../period/cache/period-base-data-cache";
import { readOrganizeSnapshot } from "../organize/data";
import { planBulkLifecycle } from "../../../shared/hierarchy-organize/lifecycle";
import { validateAccountTreeBatch } from "../organize/input";
import {
  archiveAccountOperation,
  archiveAccountGroupOperation,
  unarchiveAccountOperation,
  unarchiveAccountGroupOperation,
} from "./status";
import { deleteAccountOperation, deleteAccountGroupOperation } from "./delete";
import type { OrganizeLifecycleAction } from "../../../shared/account-organize/types";

const operations = {
  archive: {
    account: archiveAccountOperation,
    accountGroup: archiveAccountGroupOperation,
  },
  unarchive: {
    account: unarchiveAccountOperation,
    accountGroup: unarchiveAccountGroupOperation,
  },
  delete: {
    account: deleteAccountOperation,
    accountGroup: deleteAccountGroupOperation,
  },
};

async function mutateBatch(
  data: ReturnType<typeof validateAccountTreeBatch>,
  action: OrganizeLifecycleAction,
) {
  await ensureAuthorizedAccountBookMutation(data.accountBookId);
  await withDatabaseConflictRetry(() =>
    withAccountBookMutation(data.accountBookId, async (tx) => {
      const before = await readOrganizeSnapshot(
        tx,
        data.accountBookId,
        "balance",
      );
      const ordered = planBulkLifecycle(before, data.items, action);
      for (const target of ordered) {
        const operation = operations[action][target.nodeType];
        await operation(
          { accountBookId: data.accountBookId, id: target.id },
          tx,
        );
      }
    }),
  );
  await invalidatePeriodBaseDataCacheForAccountBook(data.accountBookId);
}

export const archiveAccountTreeItems = createServerFn({ method: "POST" })
  .validator(validateAccountTreeBatch)
  .handler(({ data }) => mutateBatch(data, "archive"));

export const deleteAccountTreeItems = createServerFn({ method: "POST" })
  .validator(validateAccountTreeBatch)
  .handler(({ data }) => mutateBatch(data, "delete"));

export const unarchiveAccountTreeItems = createServerFn({ method: "POST" })
  .validator(validateAccountTreeBatch)
  .handler(({ data }) => mutateBatch(data, "unarchive"));
