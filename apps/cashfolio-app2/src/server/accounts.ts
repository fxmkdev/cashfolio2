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
