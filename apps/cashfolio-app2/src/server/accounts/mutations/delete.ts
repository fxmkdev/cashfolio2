import { type AccountBookNodeIdInput } from "./types";
import { Prisma } from "../../../.prisma-client/client";
import {
  assertNoSystemManagedAccountSubtype,
  assertNoSystemManagedGroupSubtype,
} from "../accounts-system-managed-equity-guards";
import {
  getAccountDeleteAvailability,
  getGroupDeleteAvailability,
} from "../account-tree-rules";

export async function deleteAccountOperation(
  data: AccountBookNodeIdInput,
  tx: Prisma.TransactionClient,
) {
  const [account, bookingCount] = await Promise.all([
    tx.account.findUniqueOrThrow({
      where: {
        id_accountBookId: { id: data.id, accountBookId: data.accountBookId },
      },
      select: { type: true, equityAccountSubtype: true },
    }),
    tx.booking.count({
      where: { accountId: data.id, accountBookId: data.accountBookId },
    }),
  ]);
  assertNoSystemManagedAccountSubtype(account);
  const deleteAvailability = getAccountDeleteAvailability(bookingCount > 0);
  if (!deleteAvailability.enabled) {
    throw new Error(deleteAvailability.disabledReason);
  }
  await tx.account.delete({
    where: {
      id_accountBookId: { id: data.id, accountBookId: data.accountBookId },
    },
  });
  return { data: undefined, invalidatePeriodCache: true };
}

export async function deleteAccountGroupOperation(
  data: AccountBookNodeIdInput,
  tx: Prisma.TransactionClient,
) {
  const [group, childAccounts, childGroups] = await Promise.all([
    tx.accountGroup.findUniqueOrThrow({
      where: {
        id_accountBookId: { id: data.id, accountBookId: data.accountBookId },
      },
      select: {
        type: true,
        equityAccountSubtype: true,
      },
    }),
    tx.account.count({
      where: { groupId: data.id, accountBookId: data.accountBookId },
    }),
    tx.accountGroup.count({
      where: { parentGroupId: data.id, accountBookId: data.accountBookId },
    }),
  ]);
  assertNoSystemManagedGroupSubtype(group);
  const deleteAvailability = getGroupDeleteAvailability({
    hasChildAccounts: childAccounts > 0,
    hasChildGroups: childGroups > 0,
  });
  if (!deleteAvailability.enabled) {
    throw new Error(deleteAvailability.disabledReason);
  }
  await tx.accountGroup.delete({
    where: {
      id_accountBookId: { id: data.id, accountBookId: data.accountBookId },
    },
  });
  return { data: undefined, invalidatePeriodCache: true };
}
