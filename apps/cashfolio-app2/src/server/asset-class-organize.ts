import { readManagedAssetClasses } from "./classification-data.server";
import { createHash } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import type { Prisma } from "../.prisma-client/client";
import { prisma } from "../prisma.server";
import { ensureAuthorizedForAccountBookId } from "../account-books/functions.server";
import { ASSET_CLASS_SCHEME_ID } from "../shared/classification/asset-class";
import { planAssetClassMove } from "../shared/hierarchy-organize/move";
import type {
  AssetClassOrganizeNode,
  OrganizeMoveResult,
  OrganizeSnapshot,
} from "../shared/hierarchy-organize/types";
import {
  assertRecord,
  requireArrayField,
  requireEnumField,
  requireStringField,
} from "./input-validation";
import { ensureAuthorizedAccountBookMutation } from "./mutation-guard.server";
import { withAccountBookMutation } from "./account-book-mutation.server";
import { withDatabaseConflictRetry } from "./database-conflict-retry.server";
import { invalidatePeriodBaseDataCacheForAccountBook } from "./period/cache/period-base-data-cache.server";

function bookInput(value: unknown) {
  assertRecord(value);
  return { accountBookId: requireStringField(value, "accountBookId") };
}

async function readSnapshot(
  tx: Prisma.TransactionClient,
  accountBookId: string,
) {
  const nodes: AssetClassOrganizeNode[] = (
    await readManagedAssetClasses(tx, accountBookId)
  ).map((node) => ({ ...node, nodeType: "assetClass" }));
  // Assignment changes refresh deletion choices without invalidating movement.
  const version = createHash("sha256")
    .update(
      JSON.stringify(
        nodes
          .toSorted((a, b) => a.id.localeCompare(b.id))
          .map(({ id, name, parentId, sortOrder }) => ({
            id,
            name,
            parentId,
            sortOrder,
          })),
      ),
    )
    .digest("hex");
  const actionAvailability: OrganizeSnapshot["actionAvailability"] =
    Object.fromEntries(
      nodes.map((node) => {
        const hasChildren = nodes.some((child) => child.parentId === node.id);
        return [
          node.id,
          {
            archivable: false,
            unarchivable: false,
            deletable: !hasChildren,
            ...(hasChildren
              ? { deleteDisabledReason: "Move or delete child classes first" }
              : {}),
          },
        ];
      }),
    );
  return { nodes, version, actionAvailability };
}

export const getAssetClassOrganizeData = createServerFn({ method: "GET" })
  .validator(bookInput)
  .handler(async ({ data }) => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);
    return prisma.$transaction((tx) => readSnapshot(tx, data.accountBookId), {
      isolationLevel: "RepeatableRead",
    });
  });

export const moveAssetClassTreeItems = createServerFn({ method: "POST" })
  .validator((value: unknown) => {
    assertRecord(value);
    return {
      ...bookInput(value),
      version: requireStringField(value, "version"),
      items: requireArrayField(value, "items").map((item) => {
        assertRecord(item);
        return {
          id: requireStringField(item, "id"),
          nodeType: requireEnumField(item, "nodeType", ["assetClass"] as const),
        };
      }),
      parentId:
        value.parentId === null ? null : requireStringField(value, "parentId"),
      placement: requireEnumField(value, "placement", [
        "first",
        "last",
        "before",
        "after",
      ] as const),
      anchorId:
        value.anchorId === undefined
          ? undefined
          : requireStringField(value, "anchorId"),
    };
  })
  .handler(async ({ data }): Promise<OrganizeMoveResult> => {
    await ensureAuthorizedAccountBookMutation(data.accountBookId);
    const result = await withDatabaseConflictRetry(() =>
      withAccountBookMutation(data.accountBookId, async (tx) => {
        const before = await readSnapshot(tx, data.accountBookId);
        if (data.version !== before.version)
          throw new Error(
            "The asset class hierarchy changed. Refresh and try the move again.",
          );
        const next = planAssetClassMove(before.nodes, data);
        if (next === before.nodes) return { snapshot: before, changed: false };
        for (let i = 0; i < next.length; i++) {
          const node = next[i];
          if (
            node.parentId === before.nodes[i].parentId &&
            node.sortOrder === before.nodes[i].sortOrder
          )
            continue;
          await tx.classificationNode.update({
            where: {
              id_schemeId_accountBookId: {
                id: node.id,
                accountBookId: data.accountBookId,
                schemeId: ASSET_CLASS_SCHEME_ID,
              },
            },
            data: { parentId: node.parentId, sortOrder: node.sortOrder },
          });
        }
        return {
          snapshot: await readSnapshot(tx, data.accountBookId),
          changed: true,
        };
      }),
    );
    if (result.changed)
      await invalidatePeriodBaseDataCacheForAccountBook(data.accountBookId);
    return result;
  });
