import { type AccountGroupInput } from "../accounts-types";
import { Prisma } from "../../../.prisma-client/client";
import {
  resolveAccountGroupCashFlag,
  normalizeMissingGroupCashAccountFlag,
  assertCashableGroupSubtree,
  applyGroupCashFlagToSubtree,
} from "../accounts-cash-rules";
import { assertNoSystemManagedGroupSubtype } from "../accounts-system-managed-equity-guards";
import { validateAccountGroupInput } from "../../../shared/account-validation";
import { type AccountGroupUpdateInput } from "./types";
import { getGroupHierarchy, ensureNoGroupCycle } from "../accounts-helpers";

export async function createAccountGroupOperation(
  data: AccountGroupInput,
  tx: Prisma.TransactionClient,
) {
  const normalizedData = await resolveAccountGroupCashFlag(
    normalizeMissingGroupCashAccountFlag(data),
    tx,
  );
  assertNoSystemManagedGroupSubtype(normalizedData);
  const siblingNames = (
    await tx.accountGroup.findMany({
      where: {
        parentGroupId: normalizedData.parentGroupId ?? null,
        accountBookId: normalizedData.accountBookId,
      },
      select: { name: true },
    })
  ).map((g) => g.name);
  validateAccountGroupInput(normalizedData, siblingNames);
  const group = await tx.accountGroup.create({
    data: {
      name: normalizedData.name,
      type: normalizedData.type,
      equityAccountSubtype: normalizedData.equityAccountSubtype,
      isActive: normalizedData.isActive ?? true,
      parentGroupId: normalizedData.parentGroupId,
      sortOrder:
        typeof normalizedData.sortOrder === "number"
          ? normalizedData.sortOrder
          : null,
      isCashAccount: normalizedData.isCashAccount ?? false,
      accountBookId: normalizedData.accountBookId,
    },
  });
  return { data: group, invalidatePeriodCache: true };
}

export async function updateAccountGroupOperation(
  data: AccountGroupUpdateInput,
  tx: Prisma.TransactionClient,
) {
  const submittedData = data;
  const existing = await tx.accountGroup.findUniqueOrThrow({
    where: {
      id_accountBookId: {
        id: submittedData.id,
        accountBookId: submittedData.accountBookId,
      },
    },
    select: {
      type: true,
      equityAccountSubtype: true,
      isCashAccount: true,
      isActive: true,
    },
  });
  assertNoSystemManagedGroupSubtype(existing);
  if (
    submittedData.type !== existing.type ||
    submittedData.equityAccountSubtype !==
      (existing.equityAccountSubtype ?? undefined)
  ) {
    throw new Error("Group type cannot be changed");
  }
  const normalizedData = await resolveAccountGroupCashFlag(
    {
      ...submittedData,
      isActive: existing.isActive,
      isCashAccount: submittedData.isCashAccount ?? existing.isCashAccount,
    },
    tx,
  );

  const [siblingGroups, groupById] = await Promise.all([
    tx.accountGroup.findMany({
      where: {
        parentGroupId: normalizedData.parentGroupId ?? null,
        accountBookId: normalizedData.accountBookId,
        id: { not: normalizedData.id },
      },
      select: { name: true },
    }),
    getGroupHierarchy(normalizedData.accountBookId, tx),
  ]);
  const siblingNames = siblingGroups.map((g) => g.name);
  validateAccountGroupInput(normalizedData, siblingNames);
  ensureNoGroupCycle({
    groupId: normalizedData.id,
    parentGroupId: normalizedData.parentGroupId,
    groupById,
  });
  if (normalizedData.isCashAccount) {
    await assertCashableGroupSubtree({
      tx,
      accountBookId: normalizedData.accountBookId,
      groupId: normalizedData.id,
    });
  }

  const group = await tx.accountGroup.update({
    where: {
      id_accountBookId: {
        id: normalizedData.id,
        accountBookId: normalizedData.accountBookId,
      },
    },
    data: {
      name: normalizedData.name,
      parentGroupId: normalizedData.parentGroupId ?? null,
      sortOrder:
        typeof normalizedData.sortOrder === "number"
          ? normalizedData.sortOrder
          : null,
      isCashAccount: normalizedData.isCashAccount ?? false,
    },
  });

  await applyGroupCashFlagToSubtree({
    tx,
    accountBookId: normalizedData.accountBookId,
    groupId: normalizedData.id,
    isCashAccount: normalizedData.isCashAccount ?? false,
  });
  return { data: group, invalidatePeriodCache: true };
}
