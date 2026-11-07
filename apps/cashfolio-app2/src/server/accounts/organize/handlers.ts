import type { AccountOrganizeScope } from "../../../shared/account-organize/scope";
import { createServerFn } from "@tanstack/react-start";
import type { Prisma } from "../../../.prisma-client/client";
import { prisma } from "../../../prisma.server";
import { ensureAuthorizedForAccountBookId } from "../../../account-books/functions.server";
import { ensureAuthorizedAccountBookMutation } from "../../mutation-guard.server";
import { withAccountBookMutation } from "../../account-book-mutation.server";
import { withDatabaseConflictRetry } from "../../database-conflict-retry";
import { invalidatePeriodBaseDataCacheForAccountBook } from "../../period/cache/period-base-data-cache";
import {
  organizeChanges,
  planAccountMove,
} from "../../../shared/account-organize/move";
import type {
  OrganizeMoveResult,
  OrganizeSnapshot,
} from "../../../shared/account-organize/types";
import { assertOrganizeVersion, readOrganizeSnapshot } from "./data";
import { validateOrganizeBook, validateOrganizeMove } from "./input";
import {
  validateAccountName,
  validateAccountGroupName,
} from "../../../shared/account-validation";

export const getAccountOrganizeData = createServerFn({ method: "GET" })
  .validator(validateOrganizeBook)
  .handler(async ({ data }) => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);
    return prisma.$transaction(
      (tx) => readOrganizeSnapshot(tx, data.accountBookId, data.scope),
      { isolationLevel: "RepeatableRead" },
    );
  });

async function persistOrganize(
  tx: Prisma.TransactionClient,
  accountBookId: string,
  before: OrganizeSnapshot,
  next: OrganizeSnapshot["nodes"],
  scope: AccountOrganizeScope = "balance",
) {
  const changes = organizeChanges(before.nodes, next);
  const newRoots = next.filter(
    (node) =>
      node.parentId === null &&
      before.nodes.some(
        (previous) => previous.id === node.id && previous.parentId !== null,
      ),
  );
  if (newRoots.length) {
    // Existing editors also check root names against categories/system accounts.
    const [accounts, groups] = await Promise.all([
      tx.account.findMany({
        where:
          scope === "balance"
            ? { accountBookId, type: { not: "BALANCE" }, groupId: null }
            : {
                accountBookId,
                groupId: null,
                id: {
                  notIn: before.nodes
                    .filter((node) => node.nodeType === "account")
                    .map((node) => node.id),
                },
              },
        select: { name: true },
      }),
      tx.accountGroup.findMany({
        where:
          scope === "balance"
            ? { accountBookId, type: { not: "BALANCE" }, parentGroupId: null }
            : {
                accountBookId,
                parentGroupId: null,
                id: {
                  notIn: before.nodes
                    .filter((node) => node.nodeType === "accountGroup")
                    .map((node) => node.id),
                },
              },
        select: { name: true },
      }),
    ]);
    for (const node of newRoots) {
      const error =
        node.nodeType === "account"
          ? validateAccountName(
              node.name,
              accounts.map((item) => item.name),
            )
          : validateAccountGroupName(
              node.name,
              groups.map((item) => item.name),
            );
      if (error) throw new Error(error);
    }
  }
  for (const change of changes) {
    const where = { id_accountBookId: { id: change.id, accountBookId } };
    if (change.nodeType === "account") {
      await tx.account.update({
        where,
        data: {
          groupId: change.parentId,
          sortOrder: change.sortOrder,
          ...(scope === "balance"
            ? { isCashAccount: change.isCashAccount }
            : {}),
        },
      });
    } else {
      await tx.accountGroup.update({
        where,
        data: {
          parentGroupId: change.parentId,
          sortOrder: change.sortOrder,
          ...(scope === "balance"
            ? { isCashAccount: change.isCashAccount }
            : {}),
        },
      });
    }
  }
  const snapshot = changes.length
    ? await readOrganizeSnapshot(tx, accountBookId, scope)
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
      const before = await readOrganizeSnapshot(
        tx,
        data.accountBookId,
        data.scope,
      );
      assertOrganizeVersion(before, data.version);
      const next = planAccountMove(before.nodes, data);
      const saved = await persistOrganize(
        tx,
        data.accountBookId,
        before,
        next,
        data.scope,
      );
      return saved;
    });
    return result;
  });
