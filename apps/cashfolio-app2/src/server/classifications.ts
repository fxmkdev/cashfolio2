import { createServerFn } from "@tanstack/react-start";
import { createId } from "@paralleldrive/cuid2";
import type { Prisma } from "../.prisma-client/client";
import { prisma } from "../prisma.server";
import { ensureAuthorizedForAccountBookId } from "../account-books/functions.server";
import { ASSET_CLASS_SCHEME_ID } from "../shared/classification/asset-class";
import { validateClassificationChange } from "../shared/classification/classification-rules";
import {
  assertRecord,
  requireStringField,
  optionalField,
} from "./input-validation";
import { ensureAuthorizedAccountBookMutation } from "./mutation-guard.server";
import { withAccountBookMutation } from "./account-book-mutation.server";
import { withDatabaseConflictRetry } from "./database-conflict-retry.server";
import { invalidatePeriodBaseDataCacheForAccountBook } from "./period/cache/period-base-data-cache.server";
import {
  readManagedAssetClasses,
  writeAssetClass,
} from "./classification-data.server";

function bookInput(value: unknown) {
  assertRecord(value);
  return { accountBookId: requireStringField(value, "accountBookId") };
}
function nullableId(value: Record<string, unknown>, field: string) {
  return value[field] === null ? null : requireStringField(value, field);
}
const nodeSelection = {
  id: true,
  name: true,
  parentId: true,
  sortOrder: true,
} as const;

/** Shared editor metadata; assignment counts are only needed by Settings. */
export const getAssetClassNodes = createServerFn({ method: "GET" })
  .validator(bookInput)
  .handler(async ({ data }) => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);
    return prisma.classificationNode.findMany({
      where: {
        accountBookId: data.accountBookId,
        schemeId: ASSET_CLASS_SCHEME_ID,
      },
      select: nodeSelection,
    });
  });

export const getAssetClasses = createServerFn({ method: "GET" })
  .validator(bookInput)
  .handler(async ({ data }) => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);
    return readManagedAssetClasses(prisma, data.accountBookId);
  });
async function mutate(
  accountBookId: string,
  operation: (tx: Prisma.TransactionClient) => Promise<void>,
) {
  await ensureAuthorizedAccountBookMutation(accountBookId);
  await withDatabaseConflictRetry(() =>
    withAccountBookMutation(accountBookId, operation),
  );
  await invalidatePeriodBaseDataCacheForAccountBook(accountBookId);
}
export const saveAssetClass = createServerFn({ method: "POST" })
  .validator((value: unknown) => {
    assertRecord(value);
    return {
      ...bookInput(value),
      id: optionalField(value, "id", requireStringField),
      name: requireStringField(value, "name").trim(),
      parentId: nullableId(value, "parentId"),
    };
  })
  .handler(async ({ data }) =>
    mutate(data.accountBookId, async (tx) => {
      const where = {
        accountBookId: data.accountBookId,
        schemeId: ASSET_CLASS_SCHEME_ID,
      };
      const nodes = await tx.classificationNode.findMany({ where });
      validateClassificationChange(nodes, data);
      const current = nodes.find((n) => n.id === data.id);
      const sortOrder =
        current?.parentId === data.parentId
          ? current.sortOrder
          : Math.max(
              -1,
              ...nodes
                .filter((n) => n.parentId === data.parentId)
                .map((n) => n.sortOrder),
            ) + 1;
      if (data.id)
        await tx.classificationNode.update({
          where: { id_schemeId_accountBookId: { ...where, id: data.id } },
          data: { name: data.name, parentId: data.parentId, sortOrder },
        });
      else
        await tx.classificationNode.create({
          data: {
            ...where,
            id: createId(),
            name: data.name,
            parentId: data.parentId,
            sortOrder,
          },
        });
    }),
  );
export const deleteAssetClass = createServerFn({ method: "POST" })
  .validator((value: unknown) => {
    assertRecord(value);
    return {
      ...bookInput(value),
      id: requireStringField(value, "id"),
      replacementId: nullableId(value, "replacementId"),
    };
  })
  .handler(async ({ data }) =>
    mutate(data.accountBookId, async (tx) => {
      const where = {
        accountBookId: data.accountBookId,
        schemeId: ASSET_CLASS_SCHEME_ID,
      };
      const node = await tx.classificationNode.findUnique({
        where: { id_schemeId_accountBookId: { ...where, id: data.id } },
        include: {
          children: { select: { id: true } },
          assignments: { select: { accountId: true } },
        },
      });
      if (!node)
        throw new Error(
          "This asset class is no longer available. Refresh and try again.",
        );
      if (node.children.length)
        throw new Error(
          "Move or delete the child classes before deleting this class.",
        );
      if (data.replacementId === data.id)
        throw new Error("Choose another class or Unclassified.");
      await writeAssetClass(
        tx,
        data.accountBookId,
        node.assignments.map((a) => a.accountId),
        data.replacementId,
      );
      await tx.classificationNode.delete({
        where: { id_schemeId_accountBookId: { ...where, id: data.id } },
      });
    }),
  );
