import { type ReorderAccountTreeItemsInput } from "./types";
import { Prisma } from "../../../.prisma-client/client";

export async function reorderAccountTreeItemsOperation(
  data: ReorderAccountTreeItemsInput,
  tx: Prisma.TransactionClient,
) {
  await Promise.all(
    data.updates.map((u) =>
      u.nodeType === "account"
        ? tx.account.update({
            where: {
              id_accountBookId: {
                id: u.id,
                accountBookId: data.accountBookId,
              },
            },
            data: { sortOrder: u.sortOrder },
          })
        : tx.accountGroup.update({
            where: {
              id_accountBookId: {
                id: u.id,
                accountBookId: data.accountBookId,
              },
            },
            data: { sortOrder: u.sortOrder },
          }),
    ),
  );
  return { data: undefined, invalidatePeriodCache: true };
}
