import { prisma } from "../../prisma.server";
import type {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../../.prisma-client/enums";
import { createGroupPathResolver } from "../accounts/accounts-helpers";
import {
  type AccountState,
  getDisplayBalanceInReferenceCurrencyByAccountId,
} from "./accounts-queries-reference-balances";
import {
  fetchAccountReferenceBalancesQueryData,
  fetchAccountTreeQueryData,
} from "./accounts-queries-tree-data";
import { buildAccountTreeGroupActionAvailabilitySets } from "./accounts-tree-action-availability";
import {
  buildAccountRows,
  buildGroupRows,
  filterGroupsForAccountState,
  sortAccountTreeRows,
} from "./accounts-tree-rows";

export type AccountTreeDataInput = {
  accountBookId: string;
  type?: AccountType;
  equityAccountSubtype?: EquityAccountSubtype;
  accountState?: AccountState;
  includeReferenceBalances?: boolean;
  includeActionAvailability?: boolean;
};

export type AccountReferenceBalancesInput = {
  accountBookId: string;
  type?: AccountType;
  equityAccountSubtype?: EquityAccountSubtype;
  accountState?: AccountState;
};

export type AccountsPageDataInput = {
  accountBookId: string;
  type?: AccountType;
  equityAccountSubtype?: EquityAccountSubtype;
  accountState?: AccountState;
};

export type ExistingNode = {
  id: string;
  name: string;
  nodeType: "account" | "accountGroup";
  parentId?: string;
  groupId?: string;
};

export async function queryAccountGroups(accountBookId: string) {
  const groups = await prisma.accountGroup.findMany({
    where: { accountBookId, isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  const resolveGroupPath = createGroupPathResolver(groups);
  return groups
    .map((group) => ({
      value: group.id,
      label: resolveGroupPath(group.id),
      type: group.type,
      equityAccountSubtype: group.equityAccountSubtype,
      parentGroupId: group.parentGroupId,
    }))
    .toSorted((a, b) => a.label.localeCompare(b.label));
}

export async function queryExistingNodes(accountBookId: string) {
  const [accounts, accountGroups] = await Promise.all([
    prisma.account.findMany({
      where: {
        accountBookId,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        groupId: true,
      },
    }),
    prisma.accountGroup.findMany({
      where: {
        accountBookId,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        parentGroupId: true,
      },
    }),
  ]);

  return [
    ...accounts.map(
      (account): ExistingNode => ({
        id: account.id,
        name: account.name,
        nodeType: "account",
        groupId: account.groupId ?? undefined,
      }),
    ),
    ...accountGroups.map(
      (group): ExistingNode => ({
        id: group.id,
        name: group.name,
        nodeType: "accountGroup",
        parentId: group.parentGroupId ?? undefined,
      }),
    ),
  ];
}

export async function queryAccountTreeData(data: AccountTreeDataInput) {
  const accountState = data.accountState ?? "active";
  const includeReferenceBalances = data.includeReferenceBalances ?? true;
  const includeActionAvailability = data.includeActionAvailability ?? true;

  const {
    accounts,
    accountGroups,
    groupById,
    accountBook,
    rawBalanceByAccountId,
    openingRawBalanceByAccountId,
    bookingCounts,
    allAccountsForGroup,
    allGroupsForParent,
    activeAccountsForGroup,
    activeGroupsForParent,
  } = await fetchAccountTreeQueryData({
    accountBookId: data.accountBookId,
    accountState,
    type: data.type,
    equityAccountSubtype: data.equityAccountSubtype,
    includeActionAvailability,
  });

  const bookingCountByAccountId = new Map(
    bookingCounts.map((bookingCount) => [
      bookingCount.accountId,
      bookingCount._count,
    ]),
  );
  const referenceCurrency = accountBook.referenceCurrency.toUpperCase();
  const normalizedAccounts = accounts.map((account) => ({
    id: account.id,
    name: account.name,
    type: account.type,
    equityAccountSubtype: account.equityAccountSubtype,
    unit: account.unit as Unit | null,
    currency: account.currency as string | null,
    cryptocurrency: account.cryptocurrency as string | null,
    symbol: account.symbol as string | null,
    tradeCurrency: account.tradeCurrency as string | null,
    groupId: account.groupId,
    isActive: account.isActive,
    sortOrder: account.sortOrder,
  }));
  const displayBalanceInReferenceCurrencyByAccountId =
    await getDisplayBalanceInReferenceCurrencyByAccountId({
      accounts: accounts.map((account) => ({
        id: account.id,
        type: account.type,
        unit: account.unit as Unit | null,
        currency: account.currency as string | null,
        cryptocurrency: account.cryptocurrency as string | null,
        symbol: account.symbol as string | null,
        tradeCurrency: account.tradeCurrency as string | null,
      })),
      rawBalanceByAccountId,
      referenceCurrency,
      includeReferenceBalances,
    });

  const accountRows = buildAccountRows({
    accounts: normalizedAccounts,
    rawBalanceByAccountId,
    openingRawBalanceByAccountId,
    displayBalanceInReferenceCurrencyByAccountId,
    bookingCountByAccountId,
    groupById,
    includeActionAvailability,
  });
  const filteredGroups = filterGroupsForAccountState({
    accountState,
    accountGroups: accountGroups.map((group) => ({
      id: group.id,
      name: group.name,
      type: group.type,
      equityAccountSubtype: group.equityAccountSubtype,
      parentGroupId: group.parentGroupId,
      isActive: group.isActive,
      sortOrder: group.sortOrder,
    })),
    accounts: normalizedAccounts,
  });

  const groupActionAvailabilitySets =
    buildAccountTreeGroupActionAvailabilitySets({
      allAccountsForGroup,
      allGroupsForParent,
      activeAccountsForGroup,
      activeGroupsForParent,
    });

  const groupRows = buildGroupRows({
    groups: filteredGroups,
    groupById,
    includeActionAvailability,
    groupsWithChildAccounts:
      groupActionAvailabilitySets.groupsWithChildAccounts,
    groupsWithChildGroups: groupActionAvailabilitySets.groupsWithChildGroups,
    groupsWithActiveChildAccounts:
      groupActionAvailabilitySets.groupsWithActiveChildAccounts,
    groupsWithActiveChildGroups:
      groupActionAvailabilitySets.groupsWithActiveChildGroups,
  });

  return {
    referenceCurrency,
    rows: sortAccountTreeRows([...accountRows, ...groupRows]),
  };
}

export async function queryAccountReferenceBalances(
  data: AccountReferenceBalancesInput,
) {
  const accountState = data.accountState ?? "active";

  const { accounts, rawBalanceByAccountId, referenceCurrency } =
    await fetchAccountReferenceBalancesQueryData({
      accountBookId: data.accountBookId,
      accountState,
      type: data.type,
      equityAccountSubtype: data.equityAccountSubtype,
    });
  const displayBalanceInReferenceCurrencyByAccountId =
    await getDisplayBalanceInReferenceCurrencyByAccountId({
      accounts: accounts.map((account) => ({
        id: account.id,
        type: account.type,
        unit: account.unit as Unit | null,
        currency: account.currency as string | null,
        cryptocurrency: account.cryptocurrency as string | null,
        symbol: account.symbol as string | null,
        tradeCurrency: account.tradeCurrency as string | null,
      })),
      rawBalanceByAccountId,
      referenceCurrency,
      includeReferenceBalances: true,
    });

  return {
    referenceCurrency,
    rows: accounts.map((account) => ({
      id: account.id,
      balanceInReferenceCurrency:
        displayBalanceInReferenceCurrencyByAccountId.get(account.id) ?? null,
    })),
  };
}

export async function queryAccountsPageData(data: AccountsPageDataInput) {
  const accountState = data.accountState ?? "active";

  const [treeData, accountGroups, existingNodes] = await Promise.all([
    queryAccountTreeData({
      accountBookId: data.accountBookId,
      accountState,
      type: data.type,
      equityAccountSubtype: data.equityAccountSubtype,
      includeReferenceBalances: false,
    }),
    accountState === "active"
      ? queryAccountGroups(data.accountBookId)
      : Promise.resolve([]),
    accountState === "active"
      ? queryExistingNodes(data.accountBookId)
      : Promise.resolve([]),
  ]);

  return {
    accountGroups,
    existingNodes,
    referenceCurrency: treeData.referenceCurrency,
    rows: treeData.rows,
  };
}
