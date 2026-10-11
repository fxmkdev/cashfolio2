import { type AccountBookNodeIdInput } from "./types";
import { Prisma } from "../../../.prisma-client/client";
import {
  assertNoSystemManagedAccountSubtype,
  assertNoSystemManagedGroupSubtype,
} from "../accounts-system-managed-equity-guards";
import {
  accountTypeRequiresZeroBalanceForArchive,
  getAccountArchiveAvailability,
  getGroupArchiveAvailability,
  getAccountUnarchiveAvailability,
  getGroupUnarchiveAvailability,
} from "../account-tree-rules";
import { moneyIsZero } from "../../../shared/money";
import {
  getGroupHierarchy,
  hasInactiveAncestorGroup,
} from "../accounts-helpers";

export async function archiveAccountOperation(
  data: AccountBookNodeIdInput,
  tx: Prisma.TransactionClient,
) {
  const account = await tx.account.findUniqueOrThrow({
    where: {
      id_accountBookId: { id: data.id, accountBookId: data.accountBookId },
    },
    select: { type: true, equityAccountSubtype: true, isActive: true },
  });
  assertNoSystemManagedAccountSubtype(account);

  if (!account.isActive) {
    return { data: undefined, invalidatePeriodCache: false };
  }

  let hasZeroBalance = true;
  if (accountTypeRequiresZeroBalanceForArchive(account.type)) {
    const balance = await tx.booking.aggregate({
      where: { accountId: data.id, accountBookId: data.accountBookId },
      _sum: { value: true },
    });
    hasZeroBalance = moneyIsZero(balance._sum.value ?? 0);
  }
  const archiveAvailability = getAccountArchiveAvailability({
    isActive: account.isActive,
    hasZeroBalance,
  });
  if (!archiveAvailability.enabled) {
    throw new Error(archiveAvailability.disabledReason);
  }

  await tx.account.update({
    where: {
      id_accountBookId: { id: data.id, accountBookId: data.accountBookId },
    },
    data: { isActive: false },
  });
  return { data: undefined, invalidatePeriodCache: true };
}

export async function archiveAccountGroupOperation(
  data: AccountBookNodeIdInput,
  tx: Prisma.TransactionClient,
) {
  const group = await tx.accountGroup.findUniqueOrThrow({
    where: {
      id_accountBookId: { id: data.id, accountBookId: data.accountBookId },
    },
    select: { isActive: true, type: true, equityAccountSubtype: true },
  });
  assertNoSystemManagedGroupSubtype(group);

  if (!group.isActive) {
    return { data: undefined, invalidatePeriodCache: false };
  }

  const [activeChildAccounts, activeChildGroups] = await Promise.all([
    tx.account.count({
      where: {
        groupId: data.id,
        accountBookId: data.accountBookId,
        isActive: true,
      },
    }),
    tx.accountGroup.count({
      where: {
        parentGroupId: data.id,
        accountBookId: data.accountBookId,
        isActive: true,
      },
    }),
  ]);

  const archiveAvailability = getGroupArchiveAvailability({
    isActive: group.isActive,
    hasActiveChildAccounts: activeChildAccounts > 0,
    hasActiveChildGroups: activeChildGroups > 0,
  });
  if (!archiveAvailability.enabled) {
    throw new Error(archiveAvailability.disabledReason);
  }

  await tx.accountGroup.update({
    where: {
      id_accountBookId: { id: data.id, accountBookId: data.accountBookId },
    },
    data: { isActive: false },
  });
  return { data: undefined, invalidatePeriodCache: true };
}

export async function unarchiveAccountOperation(
  data: AccountBookNodeIdInput,
  tx: Prisma.TransactionClient,
) {
  const account = await tx.account.findUniqueOrThrow({
    where: {
      id_accountBookId: { id: data.id, accountBookId: data.accountBookId },
    },
    select: {
      isActive: true,
      groupId: true,
      type: true,
      equityAccountSubtype: true,
    },
  });
  assertNoSystemManagedAccountSubtype(account);

  if (account.isActive) {
    return { data: undefined, invalidatePeriodCache: false };
  }

  const groupById = await getGroupHierarchy(data.accountBookId, tx);
  const unarchiveAvailability = getAccountUnarchiveAvailability({
    isActive: account.isActive,
    hasInactiveAncestor: hasInactiveAncestorGroup(account.groupId, groupById),
  });
  if (!unarchiveAvailability.enabled) {
    throw new Error(unarchiveAvailability.disabledReason);
  }

  await tx.account.update({
    where: {
      id_accountBookId: { id: data.id, accountBookId: data.accountBookId },
    },
    data: { isActive: true },
  });
  return { data: undefined, invalidatePeriodCache: true };
}

export async function unarchiveAccountGroupOperation(
  data: AccountBookNodeIdInput,
  tx: Prisma.TransactionClient,
) {
  const group = await tx.accountGroup.findUniqueOrThrow({
    where: {
      id_accountBookId: { id: data.id, accountBookId: data.accountBookId },
    },
    select: {
      isActive: true,
      parentGroupId: true,
      type: true,
      equityAccountSubtype: true,
    },
  });
  assertNoSystemManagedGroupSubtype(group);

  if (group.isActive) {
    return { data: undefined, invalidatePeriodCache: false };
  }

  const groupById = await getGroupHierarchy(data.accountBookId, tx);
  const unarchiveAvailability = getGroupUnarchiveAvailability({
    isActive: group.isActive,
    hasInactiveAncestor: hasInactiveAncestorGroup(
      group.parentGroupId,
      groupById,
    ),
  });
  if (!unarchiveAvailability.enabled) {
    throw new Error(unarchiveAvailability.disabledReason);
  }

  await tx.accountGroup.update({
    where: {
      id_accountBookId: { id: data.id, accountBookId: data.accountBookId },
    },
    data: { isActive: true },
  });
  return { data: undefined, invalidatePeriodCache: true };
}
