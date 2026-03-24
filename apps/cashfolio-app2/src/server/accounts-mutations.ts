import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../prisma.server";
import {
  validateAccountInput,
  validateAccountGroupInput,
} from "../shared/account-validation";
import { ensureAuthorizedForAccountBookId } from "../account-books/functions.server";
import {
  ensureNoGroupCycle,
  getGroupHierarchy,
  hasInactiveAncestorGroup,
} from "./accounts-helpers";
import type { AccountGroupInput, AccountInput } from "./accounts-types";
import {
  accountTypeRequiresZeroBalanceForArchive,
  getAccountArchiveAvailability,
  getAccountDeleteAvailability,
  getAccountUnarchiveAvailability,
  getGroupArchiveAvailability,
  getGroupDeleteAvailability,
  getGroupUnarchiveAvailability,
} from "./account-tree-rules";

export const createAccount = createServerFn({ method: "POST" })
  .inputValidator((data: AccountInput) => data)
  .handler(async ({ data }) => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);
    const siblingNames = (
      await prisma.account.findMany({
        where: {
          groupId: data.groupId ?? null,
          accountBookId: data.accountBookId,
        },
        select: { name: true },
      })
    ).map((a) => a.name);
    validateAccountInput(data, siblingNames);
    const account = await prisma.account.create({
      data: {
        name: data.name,
        type: data.type,
        equityAccountSubtype: data.equityAccountSubtype,
        groupId: data.groupId ?? null,
        sortOrder: typeof data.sortOrder === "number" ? data.sortOrder : null,
        unit: data.unit,
        currency: data.currency,
        cryptocurrency: data.cryptocurrency,
        symbol: data.symbol,
        tradeCurrency: data.tradeCurrency,
        accountBookId: data.accountBookId,
      },
    });
    return account;
  });

export const updateAccount = createServerFn({ method: "POST" })
  .inputValidator((data: AccountInput & { id: string }) => data)
  .handler(async ({ data }) => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);
    const siblingNames = (
      await prisma.account.findMany({
        where: {
          groupId: data.groupId ?? null,
          accountBookId: data.accountBookId,
          id: { not: data.id },
        },
        select: { name: true },
      })
    ).map((a) => a.name);
    validateAccountInput(data, siblingNames);
    const existing = await prisma.account.findUniqueOrThrow({
      where: {
        id_accountBookId: { id: data.id, accountBookId: data.accountBookId },
      },
      select: { type: true, equityAccountSubtype: true },
    });
    if (
      data.type !== existing.type ||
      data.equityAccountSubtype !== (existing.equityAccountSubtype ?? undefined)
    ) {
      throw new Error("Account type cannot be changed");
    }
    const account = await prisma.account.update({
      where: {
        id_accountBookId: { id: data.id, accountBookId: data.accountBookId },
      },
      data: {
        name: data.name,
        groupId: data.groupId ?? null,
        sortOrder: typeof data.sortOrder === "number" ? data.sortOrder : null,
        unit: data.unit,
        currency: data.currency,
        cryptocurrency: data.cryptocurrency,
        symbol: data.symbol,
        tradeCurrency: data.tradeCurrency,
      },
    });
    return account;
  });

export const createAccountGroup = createServerFn({ method: "POST" })
  .inputValidator((data: AccountGroupInput) => data)
  .handler(async ({ data }) => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);
    const siblingNames = (
      await prisma.accountGroup.findMany({
        where: {
          parentGroupId: data.parentGroupId ?? null,
          accountBookId: data.accountBookId,
        },
        select: { name: true },
      })
    ).map((g) => g.name);
    validateAccountGroupInput(data, siblingNames);
    const group = await prisma.accountGroup.create({
      data: {
        name: data.name,
        type: data.type,
        equityAccountSubtype: data.equityAccountSubtype,
        parentGroupId: data.parentGroupId,
        sortOrder: typeof data.sortOrder === "number" ? data.sortOrder : null,
        accountBookId: data.accountBookId,
      },
    });
    return group;
  });

export const updateAccountGroup = createServerFn({ method: "POST" })
  .inputValidator((data: AccountGroupInput & { id: string }) => data)
  .handler(async ({ data }) => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);
    const [siblingGroups, groupById] = await Promise.all([
      prisma.accountGroup.findMany({
        where: {
          parentGroupId: data.parentGroupId ?? null,
          accountBookId: data.accountBookId,
          id: { not: data.id },
        },
        select: { name: true },
      }),
      getGroupHierarchy(data.accountBookId),
    ]);
    const siblingNames = siblingGroups.map((g) => g.name);
    validateAccountGroupInput(data, siblingNames);
    ensureNoGroupCycle({
      groupId: data.id,
      parentGroupId: data.parentGroupId,
      groupById,
    });
    const existing = await prisma.accountGroup.findUniqueOrThrow({
      where: {
        id_accountBookId: { id: data.id, accountBookId: data.accountBookId },
      },
      select: { type: true, equityAccountSubtype: true },
    });
    if (
      data.type !== existing.type ||
      data.equityAccountSubtype !== (existing.equityAccountSubtype ?? undefined)
    ) {
      throw new Error("Group type cannot be changed");
    }
    const group = await prisma.accountGroup.update({
      where: {
        id_accountBookId: { id: data.id, accountBookId: data.accountBookId },
      },
      data: {
        name: data.name,
        parentGroupId: data.parentGroupId,
        sortOrder: typeof data.sortOrder === "number" ? data.sortOrder : null,
      },
    });
    return group;
  });

export const deleteAccount = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; accountBookId: string }) => data)
  .handler(async ({ data }) => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);
    const bookingCount = await prisma.booking.count({
      where: { accountId: data.id, accountBookId: data.accountBookId },
    });
    const deleteAvailability = getAccountDeleteAvailability(bookingCount > 0);
    if (!deleteAvailability.enabled) {
      throw new Error(deleteAvailability.disabledReason);
    }
    await prisma.account.delete({
      where: {
        id_accountBookId: { id: data.id, accountBookId: data.accountBookId },
      },
    });
  });

export const deleteAccountGroup = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; accountBookId: string }) => data)
  .handler(async ({ data }) => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);
    const [childAccounts, childGroups, accountBook] = await Promise.all([
      prisma.account.count({
        where: { groupId: data.id, accountBookId: data.accountBookId },
      }),
      prisma.accountGroup.count({
        where: { parentGroupId: data.id, accountBookId: data.accountBookId },
      }),
      prisma.accountBook.findUniqueOrThrow({
        where: { id: data.accountBookId },
        select: {
          securityHoldingGainLossAccountGroupId: true,
          cryptoHoldingGainLossAccountGroupId: true,
          fxHoldingGainLossAccountGroupId: true,
        },
      }),
    ]);
    const isReferencedByAccountBook = [
      accountBook.securityHoldingGainLossAccountGroupId,
      accountBook.cryptoHoldingGainLossAccountGroupId,
      accountBook.fxHoldingGainLossAccountGroupId,
    ].includes(data.id);
    const deleteAvailability = getGroupDeleteAvailability({
      hasChildAccounts: childAccounts > 0,
      hasChildGroups: childGroups > 0,
      isReferencedByAccountBook,
    });
    if (!deleteAvailability.enabled) {
      throw new Error(deleteAvailability.disabledReason);
    }
    await prisma.accountGroup.delete({
      where: {
        id_accountBookId: { id: data.id, accountBookId: data.accountBookId },
      },
    });
  });

export const archiveAccount = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; accountBookId: string }) => data)
  .handler(async ({ data }) => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);
    const account = await prisma.account.findUniqueOrThrow({
      where: {
        id_accountBookId: { id: data.id, accountBookId: data.accountBookId },
      },
      select: { type: true, isActive: true },
    });

    if (!account.isActive) return;

    let hasZeroBalance = true;
    if (accountTypeRequiresZeroBalanceForArchive(account.type)) {
      const balance = await prisma.booking.aggregate({
        where: { accountId: data.id, accountBookId: data.accountBookId },
        _sum: { value: true },
      });
      hasZeroBalance = Number(balance._sum.value ?? 0) === 0;
    }
    const archiveAvailability = getAccountArchiveAvailability({
      isActive: account.isActive,
      hasZeroBalance,
    });
    if (!archiveAvailability.enabled) {
      throw new Error(archiveAvailability.disabledReason);
    }

    await prisma.account.update({
      where: {
        id_accountBookId: { id: data.id, accountBookId: data.accountBookId },
      },
      data: { isActive: false },
    });
  });

export const archiveAccountGroup = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; accountBookId: string }) => data)
  .handler(async ({ data }) => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);
    const group = await prisma.accountGroup.findUniqueOrThrow({
      where: {
        id_accountBookId: { id: data.id, accountBookId: data.accountBookId },
      },
      select: { isActive: true },
    });

    if (!group.isActive) return;

    const [activeChildAccounts, activeChildGroups] = await Promise.all([
      prisma.account.count({
        where: {
          groupId: data.id,
          accountBookId: data.accountBookId,
          isActive: true,
        },
      }),
      prisma.accountGroup.count({
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

    await prisma.accountGroup.update({
      where: {
        id_accountBookId: { id: data.id, accountBookId: data.accountBookId },
      },
      data: { isActive: false },
    });
  });

export const unarchiveAccount = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; accountBookId: string }) => data)
  .handler(async ({ data }) => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);
    const account = await prisma.account.findUniqueOrThrow({
      where: {
        id_accountBookId: { id: data.id, accountBookId: data.accountBookId },
      },
      select: { isActive: true, groupId: true },
    });

    if (account.isActive) return;

    const groupById = await getGroupHierarchy(data.accountBookId);
    const unarchiveAvailability = getAccountUnarchiveAvailability({
      isActive: account.isActive,
      hasInactiveAncestor: hasInactiveAncestorGroup(account.groupId, groupById),
    });
    if (!unarchiveAvailability.enabled) {
      throw new Error(unarchiveAvailability.disabledReason);
    }

    await prisma.account.update({
      where: {
        id_accountBookId: { id: data.id, accountBookId: data.accountBookId },
      },
      data: { isActive: true },
    });
  });

export const unarchiveAccountGroup = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; accountBookId: string }) => data)
  .handler(async ({ data }) => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);
    const group = await prisma.accountGroup.findUniqueOrThrow({
      where: {
        id_accountBookId: { id: data.id, accountBookId: data.accountBookId },
      },
      select: { isActive: true, parentGroupId: true },
    });

    if (group.isActive) return;

    const groupById = await getGroupHierarchy(data.accountBookId);
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

    await prisma.accountGroup.update({
      where: {
        id_accountBookId: { id: data.id, accountBookId: data.accountBookId },
      },
      data: { isActive: true },
    });
  });

export const reorderAccountTreeItems = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      accountBookId: string;
      updates: {
        id: string;
        nodeType: "account" | "accountGroup";
        sortOrder: number;
      }[];
    }) => data,
  )
  .handler(async ({ data }) => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);
    await prisma.$transaction(
      data.updates.map((u) =>
        u.nodeType === "account"
          ? prisma.account.update({
              where: {
                id_accountBookId: {
                  id: u.id,
                  accountBookId: data.accountBookId,
                },
              },
              data: { sortOrder: u.sortOrder },
            })
          : prisma.accountGroup.update({
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
  });
