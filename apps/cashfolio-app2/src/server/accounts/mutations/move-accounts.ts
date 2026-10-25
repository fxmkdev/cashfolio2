import { AccountType } from "../../../.prisma-client/enums";
import type { Prisma } from "../../../.prisma-client/client";
import {
  cashFlowChangesMatch,
  getAccountMoveError,
  getMoveCashFlowChanges,
  getMovingAccounts,
  type MoveAccountsInput,
} from "../../../shared/bulk-account-move";

export async function moveAccountsOperation(
  data: MoveAccountsInput,
  tx: Prisma.TransactionClient,
) {
  const accounts = await tx.account.findMany({
    where: { accountBookId: data.accountBookId, id: { in: data.accountIds } },
    select: {
      id: true,
      name: true,
      type: true,
      unit: true,
      groupId: true,
      isActive: true,
      isCashAccount: true,
    },
  });
  if (
    accounts.length !== data.accountIds.length ||
    accounts.some((account) => account.type !== AccountType.BALANCE)
  ) {
    throw new Error(
      "One or more selected accounts are no longer available in this account book. Refresh and try again.",
    );
  }
  const group =
    data.targetGroupId === null
      ? null
      : await tx.accountGroup.findUnique({
          where: {
            id_accountBookId: {
              id: data.targetGroupId,
              accountBookId: data.accountBookId,
            },
          },
          select: {
            id: true,
            name: true,
            type: true,
            parentGroupId: true,
            isActive: true,
            isCashAccount: true,
          },
        });
  if (data.targetGroupId !== null && !group)
    throw new Error(
      "The destination group is no longer available in this account book. Refresh and try again.",
    );
  const siblings = await tx.account.findMany({
    where: { accountBookId: data.accountBookId, groupId: data.targetGroupId },
    select: { id: true, name: true },
  });
  const error = getAccountMoveError(accounts, group, siblings);
  if (error) throw new Error(error);
  if (
    !cashFlowChangesMatch(
      getMoveCashFlowChanges(accounts, group),
      data.expectedCashFlowChanges,
    )
  ) {
    throw new Error(
      "Cash-flow inclusion has changed since this move was reviewed. Refresh choices, review the updated cash-flow changes, and try again.",
    );
  }
  const moving = getMovingAccounts(accounts, data.targetGroupId);
  for (const isCashAccount of [false, true]) {
    const ids = moving
      .filter(
        (account) =>
          (group?.isCashAccount ?? account.isCashAccount) === isCashAccount,
      )
      .map((account) => account.id);
    if (!ids.length) continue;
    await tx.account.updateMany({
      where: {
        accountBookId: data.accountBookId,
        id: { in: ids },
        type: AccountType.BALANCE,
      },
      data: { groupId: data.targetGroupId, isCashAccount },
    });
  }
  return {
    data: { count: moving.length },
    invalidatePeriodCache: moving.length > 0,
  };
}
