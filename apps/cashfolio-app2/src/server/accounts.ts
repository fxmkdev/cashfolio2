import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../prisma.server";
import type {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../.prisma-client/enums";

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
        groupPath: getGroupPath(a.groupId, allGroups),
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
        orderBy: [{ name: "asc" }],
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

    // Top-level groups are excluded from the tree (tabs represent them).
    // Replace references to top-level groups with undefined so children become root nodes.
    const topLevelGroupIds = new Set(
      accountGroups.filter((ag) => !ag.parentGroupId).map((ag) => ag.id),
    );
    const resolveParentId = (parentId: string | null | undefined) =>
      parentId && topLevelGroupIds.has(parentId) ? undefined : parentId ?? undefined;

    const accountRows = accounts.map((a) => ({
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
      parentId: resolveParentId(a.groupId),
      isActive: a.isActive,
      groupId: a.groupId,
    }));

    const groupRows = accountGroups
      .filter((ag) => !topLevelGroupIds.has(ag.id))
      .map((ag) => ({
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
        parentId: resolveParentId(ag.parentGroupId),
        isActive: ag.isActive,
        groupId: ag.id,
      }));

    return [...accountRows, ...groupRows];
  });

export type AccountInput = {
  accountBookId: string;
  name: string;
  type: AccountType;
  equityAccountSubtype?: EquityAccountSubtype;
  groupId: string;
  unit?: Unit;
  currency?: string;
  cryptocurrency?: string;
  symbol?: string;
  tradeCurrency?: string;
};

export const createAccount = createServerFn({ method: "POST" })
  .inputValidator((data: AccountInput) => data)
  .handler(async ({ data }) => {
    const account = await prisma.account.create({
      data: {
        name: data.name,
        type: data.type,
        equityAccountSubtype: data.equityAccountSubtype,
        groupId: data.groupId,
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
    const account = await prisma.account.update({
      where: { id_accountBookId: { id: data.id, accountBookId: data.accountBookId } },
      data: {
        name: data.name,
        type: data.type,
        equityAccountSubtype: data.equityAccountSubtype,
        groupId: data.groupId,
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
};

export const createAccountGroup = createServerFn({ method: "POST" })
  .inputValidator((data: AccountGroupInput) => data)
  .handler(async ({ data }) => {
    const group = await prisma.accountGroup.create({
      data: {
        name: data.name,
        type: data.type,
        equityAccountSubtype: data.equityAccountSubtype,
        parentGroupId: data.parentGroupId,
        accountBookId: data.accountBookId,
      },
    });
    return group;
  });

export const updateAccountGroup = createServerFn({ method: "POST" })
  .inputValidator((data: AccountGroupInput & { id: string }) => data)
  .handler(async ({ data }) => {
    const group = await prisma.accountGroup.update({
      where: { id_accountBookId: { id: data.id, accountBookId: data.accountBookId } },
      data: {
        name: data.name,
        type: data.type,
        equityAccountSubtype: data.equityAccountSubtype,
        parentGroupId: data.parentGroupId,
      },
    });
    return group;
  });
