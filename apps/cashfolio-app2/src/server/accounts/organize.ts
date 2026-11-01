import { createServerFn } from "@tanstack/react-start";
import type { Prisma } from "../../.prisma-client/client";
import { prisma } from "../../prisma.server";
import { ensureAuthorizedForAccountBookId } from "../../account-books/functions.server";
import { ensureAuthorizedAccountBookMutation } from "../mutation-guard.server";
import { withAccountBookMutation } from "../account-book-mutation.server";
import { withDatabaseConflictRetry } from "../database-conflict-retry";
import { invalidatePeriodBaseDataCacheForAccountBook } from "../period/cache/period-base-data-cache";
import {
  organizeChanges,
  planAccountMove,
  restoreAccountMove,
} from "../../shared/account-organize/move";
import type {
  OrganizeMoveResult,
  OrganizeSnapshot,
} from "../../shared/account-organize/types";
import { assertOrganizeVersion, readOrganizeSnapshot } from "./organize-data";
import {
  validateOrganizeBook,
  validateOrganizeMove,
  validateOrganizeUndo,
} from "./organize-input";

export const getAccountOrganizeData = createServerFn({ method: "GET" })
  .validator(validateOrganizeBook)
  .handler(async ({ data }) => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);
    return prisma.$transaction(
      (tx) => readOrganizeSnapshot(tx, data.accountBookId),
      { isolationLevel: "RepeatableRead" },
    );
  });

async function persistOrganize(
  tx: Prisma.TransactionClient,
  accountBookId: string,
  before: OrganizeSnapshot,
  next: OrganizeSnapshot["nodes"],
) {
  const changes = organizeChanges(before.nodes, next);
  for (const change of changes) {
    const where = { id_accountBookId: { id: change.id, accountBookId } };
    if (change.nodeType === "account") {
      await tx.account.update({
        where,
        data: {
          groupId: change.parentId,
          sortOrder: change.sortOrder,
          isCashAccount: change.isCashAccount,
        },
      });
    } else {
      await tx.accountGroup.update({
        where,
        data: {
          parentGroupId: change.parentId,
          sortOrder: change.sortOrder,
          isCashAccount: change.isCashAccount,
        },
      });
    }
  }
  const snapshot = changes.length
    ? await readOrganizeSnapshot(tx, accountBookId)
    : before;
  return { snapshot, changed: changes.length > 0 };
}

async function mutateOrganize<T extends { changed: boolean }>(
  accountBookId: string,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  await ensureAuthorizedAccountBookMutation(accountBookId);
  const result = await withDatabaseConflictRetry(() =>
    withAccountBookMutation(accountBookId, operation),
  );
  if (result.changed)
    await invalidatePeriodBaseDataCacheForAccountBook(accountBookId);
  return result;
}

export const moveAccountTreeItems = createServerFn({ method: "POST" })
  .validator(validateOrganizeMove)
  .handler(async ({ data }): Promise<OrganizeMoveResult> => {
    const result = await mutateOrganize(data.accountBookId, async (tx) => {
      const before = await readOrganizeSnapshot(tx, data.accountBookId);
      assertOrganizeVersion(before, data.version);
      const next = planAccountMove(before.nodes, data);
      const saved = await persistOrganize(tx, data.accountBookId, before, next);
      return {
        ...saved,
        undo: saved.changed
          ? {
              version: saved.snapshot.version,
              restore: organizeChanges(next, before.nodes),
            }
          : null,
      };
    });
    return { snapshot: result.snapshot, undo: result.undo };
  });

export const undoAccountTreeMove = createServerFn({ method: "POST" })
  .validator(validateOrganizeUndo)
  .handler(async ({ data }): Promise<OrganizeSnapshot> => {
    const result = await mutateOrganize(data.accountBookId, async (tx) => {
      const before = await readOrganizeSnapshot(tx, data.accountBookId);
      assertOrganizeVersion(before, data.undo.version);
      const next = restoreAccountMove(before.nodes, data.undo.restore);
      return persistOrganize(tx, data.accountBookId, before, next);
    });
    return result.snapshot;
  });
