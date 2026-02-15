import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../prisma.server";
import type {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../.prisma-client/enums";
import {
  validateAccountInput,
  validateAccountGroupInput,
} from "../shared/account-validation";

function getGroupPath(
  groupId: string,
  groups: { id: string; name: string; parentGroupId: string | null }[],
): string {
  const group = groups.find((g) => g.id === groupId);
  if (!group) return `Unknown group ${groupId}`;
  const prefix = group.parentGroupId
    ? `${getGroupPath(group.parentGroupId, groups)} / `
    : "";
  return prefix + group.name;
}

export const getAccounts = createServerFn({ method: "GET" })
  .inputValidator((data: { accountBookId: string }) => data)
  .handler(async ({ data }) => {
    const [accounts, allGroups] = await Promise.all([
      prisma.account.findMany({
        where: { accountBookId: data.accountBookId },
        include: { group: true },
        orderBy: { name: "asc" },
      }),
      prisma.accountGroup.findMany({
        where: { accountBookId: data.accountBookId },
      }),
    ]);
    return accounts
      .map((a) => ({
        ...a,
        groupPath: a.groupId ? getGroupPath(a.groupId, allGroups) : "",
      }))
      .toSorted((a, b) =>
        `${a.groupPath} / ${a.name}`.localeCompare(
          `${b.groupPath} / ${b.name}`,
        ),
      );
  });

export const getAccountGroups = createServerFn({ method: "GET" })
  .inputValidator((data: { accountBookId: string }) => data)
  .handler(async ({ data }) => {
    const groups = await prisma.accountGroup.findMany({
      where: { accountBookId: data.accountBookId, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return groups
      .map((g) => ({
        value: g.id,
        label: getGroupPath(g.id, groups),
        type: g.type,
        equityAccountSubtype: g.equityAccountSubtype,
      }))
      .toSorted((a, b) => a.label.localeCompare(b.label));
  });

export const getAccountTreeData = createServerFn({ method: "GET" })
  .inputValidator(
    (data: { accountBookId: string; type?: AccountType; equityAccountSubtype?: EquityAccountSubtype }) => data,
  )
  .handler(async ({ data }) => {
    const [accounts, accountGroups] = await Promise.all([
      prisma.account.findMany({
        where: {
          accountBookId: data.accountBookId,
          isActive: true,
          type: data.type,
          ...(data.equityAccountSubtype
            ? { equityAccountSubtype: data.equityAccountSubtype }
            : undefined),
        },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
      prisma.accountGroup.findMany({
        where: {
          accountBookId: data.accountBookId,
          type: data.type,
          ...(data.equityAccountSubtype
            ? {
                OR: [
                  { equityAccountSubtype: data.equityAccountSubtype },
                  { equityAccountSubtype: null },
                ],
              }
            : undefined),
        },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
    ]);

    // Batch-fetch booking counts per account to determine deletability
    const bookingCounts = await prisma.booking.groupBy({
      by: ["accountId"],
      where: {
        accountBookId: data.accountBookId,
        accountId: { in: accounts.map((a) => a.id) },
      },
      _count: true,
    });
    const bookingCountByAccountId = new Map(
      bookingCounts.map((b) => [b.accountId, b._count]),
    );

    const accountRows = accounts.map((a) => {
      const hasBookings = (bookingCountByAccountId.get(a.id) ?? 0) > 0;
      return {
        id: a.id,
        nodeType: "account" as "account" | "accountGroup",
        name: a.name,
        type: a.type,
        equityAccountSubtype: a.equityAccountSubtype,
        unit: a.unit as Unit | null,
        currency: a.currency as string | null,
        cryptocurrency: a.cryptocurrency as string | null,
        symbol: a.symbol as string | null,
        tradeCurrency: a.tradeCurrency as string | null,
        parentId: a.groupId ?? undefined,
        isActive: a.isActive,
        groupId: a.groupId ?? undefined,
        sortOrder: a.sortOrder,
        deletable: !hasBookings,
        deleteDisabledReason: hasBookings ? "Cannot delete account because it has bookings" : undefined,
      };
    });

    // Fetch account book to check for referenced holding gain/loss groups
    const accountBook = await prisma.accountBook.findUniqueOrThrow({
      where: { id: data.accountBookId },
      select: {
        securityHoldingGainLossAccountGroupId: true,
        cryptoHoldingGainLossAccountGroupId: true,
        fxHoldingGainLossAccountGroupId: true,
      },
    });
    const referencedByAccountBook = new Set(
      [
        accountBook.securityHoldingGainLossAccountGroupId,
        accountBook.cryptoHoldingGainLossAccountGroupId,
        accountBook.fxHoldingGainLossAccountGroupId,
      ].filter(Boolean) as string[],
    );

    // Fetch all accounts (including inactive) to check group deletability
    const allAccountsForGroup = await prisma.account.groupBy({
      by: ["groupId"],
      where: { accountBookId: data.accountBookId },
      _count: true,
    });
    const accountCountByGroupId = new Set(
      allAccountsForGroup.filter((a) => a._count > 0).map((a) => a.groupId),
    );
    // Also check all groups (including inactive) for child group references
    const allGroupsForParent = await prisma.accountGroup.groupBy({
      by: ["parentGroupId"],
      where: {
        accountBookId: data.accountBookId,
        parentGroupId: { not: null },
      },
      _count: true,
    });
    const groupsWithChildren = new Set(
      allGroupsForParent
        .filter((g) => g._count > 0 && g.parentGroupId)
        .map((g) => g.parentGroupId!),
    );

    const groupRows = accountGroups.map((ag) => {
        const hasChildAccounts = accountCountByGroupId.has(ag.id);
        const hasChildGroups = groupsWithChildren.has(ag.id);
        const isReferencedByAccountBook = referencedByAccountBook.has(ag.id);
        const deletable = !hasChildAccounts && !hasChildGroups && !isReferencedByAccountBook;
        return {
          id: ag.id,
          nodeType: "accountGroup" as "account" | "accountGroup",
          name: ag.name,
          type: ag.type,
          equityAccountSubtype: ag.equityAccountSubtype,
          unit: null as Unit | null,
          currency: null as string | null,
          cryptocurrency: null as string | null,
          symbol: null as string | null,
          tradeCurrency: null as string | null,
          parentId: ag.parentGroupId ?? undefined,
          isActive: ag.isActive,
          groupId: ag.id,
          sortOrder: ag.sortOrder,
          deletable,
          deleteDisabledReason: isReferencedByAccountBook
            ? "Cannot delete group because it is used as a holding gain/loss group"
            : hasChildAccounts
              ? "Cannot delete group because it contains accounts"
              : hasChildGroups
                ? "Cannot delete group because it contains sub-groups"
                : undefined,
        };
      });

    const allRows = [...accountRows, ...groupRows];
    allRows.sort((a, b) => {
      // Group siblings together (same parentId)
      const parentA = a.parentId ?? "";
      const parentB = b.parentId ?? "";
      if (parentA !== parentB) return parentA.localeCompare(parentB);
      // sortOrder: defined values first, nulls last
      if (a.sortOrder !== b.sortOrder) {
        if (a.sortOrder == null) return 1;
        if (b.sortOrder == null) return -1;
        return a.sortOrder - b.sortOrder;
      }
      return a.name.localeCompare(b.name);
    });
    return allRows;
  });

export type AccountInput = {
  accountBookId: string;
  name: string;
  type: AccountType;
  equityAccountSubtype?: EquityAccountSubtype;
  groupId?: string;
  sortOrder?: number;
  unit?: Unit;
  currency?: string;
  cryptocurrency?: string;
  symbol?: string;
  tradeCurrency?: string;
};

export const createAccount = createServerFn({ method: "POST" })
  .inputValidator((data: AccountInput) => data)
  .handler(async ({ data }) => {
    const siblingNames = (
      await prisma.account.findMany({
        where: { groupId: data.groupId ?? null, accountBookId: data.accountBookId },
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
      where: { id_accountBookId: { id: data.id, accountBookId: data.accountBookId } },
      select: { type: true, equityAccountSubtype: true },
    });
    if (data.type !== existing.type || data.equityAccountSubtype !== (existing.equityAccountSubtype ?? undefined)) {
      throw new Error("Account type cannot be changed");
    }
    const account = await prisma.account.update({
      where: { id_accountBookId: { id: data.id, accountBookId: data.accountBookId } },
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

export type AccountGroupInput = {
  accountBookId: string;
  name: string;
  type: AccountType;
  equityAccountSubtype?: EquityAccountSubtype;
  parentGroupId?: string;
  sortOrder?: number;
};

export const createAccountGroup = createServerFn({ method: "POST" })
  .inputValidator((data: AccountGroupInput) => data)
  .handler(async ({ data }) => {
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
    const siblingNames = (
      await prisma.accountGroup.findMany({
        where: {
          parentGroupId: data.parentGroupId ?? null,
          accountBookId: data.accountBookId,
          id: { not: data.id },
        },
        select: { name: true },
      })
    ).map((g) => g.name);
    validateAccountGroupInput(data, siblingNames);
    const existing = await prisma.accountGroup.findUniqueOrThrow({
      where: { id_accountBookId: { id: data.id, accountBookId: data.accountBookId } },
      select: { type: true, equityAccountSubtype: true },
    });
    if (data.type !== existing.type || data.equityAccountSubtype !== (existing.equityAccountSubtype ?? undefined)) {
      throw new Error("Group type cannot be changed");
    }
    const group = await prisma.accountGroup.update({
      where: { id_accountBookId: { id: data.id, accountBookId: data.accountBookId } },
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
    const bookingCount = await prisma.booking.count({
      where: { accountId: data.id, accountBookId: data.accountBookId },
    });
    if (bookingCount > 0) {
      throw new Error("Cannot delete account with bookings");
    }
    await prisma.account.delete({
      where: { id_accountBookId: { id: data.id, accountBookId: data.accountBookId } },
    });
  });

export const deleteAccountGroup = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; accountBookId: string }) => data)
  .handler(async ({ data }) => {
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
    if (isReferencedByAccountBook) {
      throw new Error("Cannot delete group that is used as a holding gain/loss group");
    }
    if (childAccounts > 0) {
      throw new Error("Cannot delete group that contains accounts");
    }
    if (childGroups > 0) {
      throw new Error("Cannot delete group that contains sub-groups");
    }
    await prisma.accountGroup.delete({
      where: { id_accountBookId: { id: data.id, accountBookId: data.accountBookId } },
    });
  });

export const reorderAccountTreeItems = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      accountBookId: string;
      updates: { id: string; nodeType: "account" | "accountGroup"; sortOrder: number }[];
    }) => data,
  )
  .handler(async ({ data }) => {
    await prisma.$transaction(
      data.updates.map((u) =>
        u.nodeType === "account"
          ? prisma.account.update({
              where: { id_accountBookId: { id: u.id, accountBookId: data.accountBookId } },
              data: { sortOrder: u.sortOrder },
            })
          : prisma.accountGroup.update({
              where: { id_accountBookId: { id: u.id, accountBookId: data.accountBookId } },
              data: { sortOrder: u.sortOrder },
            }),
      ),
    );
  });
