import { prisma } from "../../../prisma.server";
import type { Unit } from "../../../.prisma-client/enums";
import type { AccountTreeMetadata } from "./tree-data.server";
import { createGroupPathSegmentsResolver } from "../hierarchy/groups.server";
import { filterGroupsForAccountState } from "./tree-rows.server";
import type { AccountState, ExistingNode } from "./types";

export async function queryAccountGroups(
  accountBookId: string,
  accountState: AccountState = "active",
  metadata?: AccountTreeMetadata,
) {
  const groups = metadata
    ? metadata.accountGroups.filter(
        (group) => accountState !== "active" || group.isActive,
      )
    : await prisma.accountGroup.findMany({
        where:
          accountState === "active"
            ? { accountBookId, isActive: true }
            : { accountBookId },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      });
  const accounts =
    accountState === "inactive"
      ? metadata
        ? metadata.accounts.filter((account) => !account.isActive)
        : await prisma.account.findMany({
            where: { accountBookId, isActive: false },
            select: { id: true, groupId: true },
          })
      : [];
  const filteredGroups = filterGroupsForAccountState({
    accountState,
    accountGroups: groups.map((group) => ({
      id: group.id,
      name: group.name,
      type: group.type,
      equityAccountSubtype: group.equityAccountSubtype,
      isCashAccount: group.isCashAccount,
      parentGroupId: group.parentGroupId,
      isActive: group.isActive,
      sortOrder: group.sortOrder,
    })),
    accounts,
  });
  const resolveGroupPathSegments = createGroupPathSegmentsResolver(groups);
  return filteredGroups
    .map((group) => {
      const pathSegments = resolveGroupPathSegments(group.id);

      return {
        value: group.id,
        label: pathSegments.join(" / "),
        type: group.type,
        equityAccountSubtype: group.equityAccountSubtype,
        isCashAccount: group.isCashAccount,
        parentGroupId: group.parentGroupId,
        treePath: pathSegments.slice(0, -1),
        treeLabel: group.name,
      };
    })
    .toSorted((a, b) => a.label.localeCompare(b.label));
}

export async function queryExistingNodes(
  accountBookId: string,
  accountState: AccountState = "active",
  metadata?: AccountTreeMetadata,
) {
  const [accounts, accountGroups] = await Promise.all([
    metadata
      ? metadata.accounts.filter(
          (account) =>
            accountState === "all" ||
            account.isActive === (accountState === "active"),
        )
      : prisma.account.findMany({
          where: {
            accountBookId,
            ...(accountState === "all"
              ? {}
              : { isActive: accountState === "active" }),
          },
          select: {
            id: true,
            name: true,
            groupId: true,
            type: true,
            unit: true,
          },
        }),
    metadata
      ? metadata.accountGroups.filter(
          (group) => accountState !== "active" || group.isActive,
        )
      : prisma.accountGroup.findMany({
          where:
            accountState === "active"
              ? { accountBookId, isActive: true }
              : { accountBookId },
          select: {
            id: true,
            name: true,
            parentGroupId: true,
            type: true,
            equityAccountSubtype: true,
            isCashAccount: true,
            isActive: true,
            sortOrder: true,
          },
        }),
  ]);
  const filteredAccountGroups = filterGroupsForAccountState({
    accountState,
    accountGroups: accountGroups.map((group) => ({
      id: group.id,
      name: group.name,
      type: group.type,
      equityAccountSubtype: group.equityAccountSubtype,
      isCashAccount: group.isCashAccount,
      parentGroupId: group.parentGroupId,
      isActive: group.isActive,
      sortOrder: group.sortOrder,
    })),
    accounts,
  });

  return [
    ...accounts.map((account): ExistingNode => ({
      id: account.id,
      name: account.name,
      nodeType: "account",
      groupId: account.groupId ?? undefined,
      type: account.type,
      unit: account.unit as Unit | null,
    })),
    ...filteredAccountGroups.map((group): ExistingNode => ({
      id: group.id,
      name: group.name,
      nodeType: "accountGroup",
      parentId: group.parentGroupId ?? undefined,
      type: group.type,
    })),
  ];
}
