import { createServerFn } from "@tanstack/react-start";
import { createId } from "@paralleldrive/cuid2";
import type { Prisma } from "../.prisma-client/client";
import { prisma } from "../prisma.server";
import { ensureAuthorizedForAccountBookId } from "../account-books/functions.server";
import { ASSET_CLASS_SCHEME_ID } from "../shared/asset-class";
import { validateClassificationChange } from "../shared/classification-rules";
import {
  assertRecord,
  requireStringField,
  requireArrayField,
  optionalField,
} from "./input-validation";
import { ensureAuthorizedAccountBookMutation } from "./mutation-guard.server";
import { withAccountBookMutation } from "./account-book-mutation.server";
import { withDatabaseConflictRetry } from "./database-conflict-retry";
import { invalidatePeriodBaseDataCacheForAccountBook } from "./period/cache/period-base-data-cache";
import { writeAssetClass } from "./classification-data";

function bookInput(value: unknown) {
  assertRecord(value);
  return { accountBookId: requireStringField(value, "accountBookId") };
}
function nullableId(value: Record<string, unknown>, field: string) {
  return value[field] === null ? null : requireStringField(value, field);
}
export const getAssetClasses = createServerFn({ method: "GET" })
  .validator(bookInput)
  .handler(async ({ data }) => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);
    const nodes = await prisma.classificationNode.findMany({
      where: {
        accountBookId: data.accountBookId,
        schemeId: ASSET_CLASS_SCHEME_ID,
      },
      select: {
        id: true,
        name: true,
        parentId: true,
        sortOrder: true,
        assignments: { select: { account: { select: { isActive: true } } } },
      },
    });
    return nodes.map(({ assignments, ...node }) => ({
      ...node,
      activeCount: assignments.filter((a) => a.account.isActive).length,
      archivedCount: assignments.filter((a) => !a.account.isActive).length,
    }));
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
export const reorderAssetClasses = createServerFn({ method: "POST" })
  .validator((value: unknown) => {
    assertRecord(value);
    const orderedIds = requireArrayField(value, "orderedIds").map((id) =>
      requireStringField({ id }, "id"),
    );
    if (new Set(orderedIds).size !== orderedIds.length)
      throw new Error("Each asset class must appear exactly once.");
    return {
      ...bookInput(value),
      parentId: nullableId(value, "parentId"),
      orderedIds,
    };
  })
  .handler(async ({ data }) =>
    mutate(data.accountBookId, async (tx) => {
      const where = {
        accountBookId: data.accountBookId,
        schemeId: ASSET_CLASS_SCHEME_ID,
      };
      if (
        data.parentId &&
        !(await tx.classificationNode.findUnique({
          where: { id_schemeId_accountBookId: { ...where, id: data.parentId } },
        }))
      )
        throw new Error(
          "The selected parent is no longer available. Refresh and try again.",
        );
      const siblings = await tx.classificationNode.findMany({
        where: { ...where, parentId: data.parentId },
      });
      const ids = new Set(siblings.map((node) => node.id));
      if (
        data.orderedIds.length !== siblings.length ||
        data.orderedIds.some((id) => !ids.has(id))
      )
        throw new Error(
          "The siblings changed. Refresh and reorder the updated list.",
        );
      for (const [sortOrder, id] of data.orderedIds.entries())
        await tx.classificationNode.update({
          where: { id_schemeId_accountBookId: { ...where, id } },
          data: { sortOrder },
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
