import { createServerFn } from "@tanstack/react-start";
import { ensureAuthorizedAccountBookMutation } from "../mutation-guard.server";
import { withAccountBookMutation } from "../account-book-mutation.server";
import { withDatabaseConflictRetry } from "../database-conflict-retry";
import { invalidatePeriodBaseDataCacheForAccountBook } from "../period/cache/period-base-data-cache";
import { readOrganizeSnapshot } from "./organize-data";
import { validateAccountTreeBatch } from "./organize-input";
import {
  archiveAccountOperation,
  archiveAccountGroupOperation,
} from "./mutations/status";
import {
  deleteAccountOperation,
  deleteAccountGroupOperation,
} from "./mutations/delete";

async function mutateBatch(
  data: ReturnType<typeof validateAccountTreeBatch>,
  action: "archive" | "delete",
) {
  await ensureAuthorizedAccountBookMutation(data.accountBookId);
  await withDatabaseConflictRetry(() =>
    withAccountBookMutation(data.accountBookId, async (tx) => {
      const before = await readOrganizeSnapshot(
        tx,
        data.accountBookId,
        "balance",
      );
      // Validate the whole selection before changing any eligibility through writes.
      for (const target of data.items) {
        const node = before.nodes.find(
          (node) => node.id === target.id && node.nodeType === target.nodeType,
        );
        if (!node)
          throw new Error(
            "A selected account or group is no longer available.",
          );
        const availability = before.actionAvailability[node.id];
        const enabled =
          action === "archive"
            ? availability.archivable
            : availability.deletable;
        if (!enabled)
          throw new Error(
            `${node.name}: ${action === "archive" ? availability.archiveDisabledReason : availability.deleteDisabledReason}`,
          );
      }
      for (const target of data.items) {
        const operation =
          action === "archive"
            ? target.nodeType === "account"
              ? archiveAccountOperation
              : archiveAccountGroupOperation
            : target.nodeType === "account"
              ? deleteAccountOperation
              : deleteAccountGroupOperation;
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
