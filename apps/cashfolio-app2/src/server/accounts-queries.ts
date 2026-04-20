import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../prisma.server";
import type {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../.prisma-client/enums";
import { ensureAuthorizedForAccountBookId } from "../account-books/functions.server";
import { createGroupPathResolver } from "./accounts-helpers";
import {
  type AccountState,
  getDisplayBalanceInReferenceCurrencyByAccountId,
} from "./accounts-queries-reference-balances";
import {
  buildAccountRows,
  buildGroupRows,
  filterGroupsForAccountState,
  sortAccountTreeRows,
} from "./accounts-tree-rows";
import {
  fetchAccountReferenceBalancesQueryData,
  fetchAccountTreeQueryData,
} from "./accounts-queries-tree-data";
import { buildAccountTreeGroupActionAvailabilitySets } from "./accounts-tree-action-availability";

type AccountTreeDataInput = {
  accountBookId: string;
  type?: AccountType;
  equityAccountSubtype?: EquityAccountSubtype;
  accountState?: AccountState;
  includeReferenceBalances?: boolean;
  includeActionAvailability?: boolean;
};

type AccountReferenceBalancesInput = {
  accountBookId: string;
  type?: AccountType;
  equityAccountSubtype?: EquityAccountSubtype;
  accountState?: AccountState;
};

type ExistingNode = {
  id: string;
  name: string;
  nodeType: "account" | "accountGroup";
  parentId?: string;
  groupId?: string;
};

async function getAccountGroupsInternal(accountBookId: string) {
  const groups = await prisma.accountGroup.findMany({
    where: { accountBookId, isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  const resolveGroupPath = createGroupPathResolver(groups);
  return groups
    .map((g) => ({
      value: g.id,
      label: resolveGroupPath(g.id),
      type: g.type,
      equityAccountSubtype: g.equityAccountSubtype,
    }))
    .toSorted((a, b) => a.label.localeCompare(b.label));
}

async function getExistingNodesInternal(accountBookId: string) {
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

async function getAccountTreeDataInternal(args: {
  data: AccountTreeDataInput;
  skipAuthorization?: boolean;
}) {
  const { data, skipAuthorization = false } = args;

  if (!skipAuthorization) {
    await ensureAuthorizedForAccountBookId(data.accountBookId);
  }
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
      accountBook,
      allAccountsForGroup,
      allGroupsForParent,
      activeAccountsForGroup,
      activeGroupsForParent,
    });

  const groupRows = buildGroupRows({
    groups: filteredGroups,
    groupById,
    includeActionAvailability,
    referencedByAccountBook:
      groupActionAvailabilitySets.referencedByAccountBook,
    groupsWithChildAccounts:
      groupActionAvailabilitySets.groupsWithChildAccounts,
    groupsWithChildGroups: groupActionAvailabilitySets.groupsWithChildGroups,
    groupsWithActiveChildAccounts:
      groupActionAvailabilitySets.groupsWithActiveChildAccounts,
    groupsWithActiveChildGroups:
      groupActionAvailabilitySets.groupsWithActiveChildGroups,
  });

  const allRows = sortAccountTreeRows([...accountRows, ...groupRows]);
  return {
    referenceCurrency: accountBook.referenceCurrency.toUpperCase(),
    rows: allRows,
  };
}

async function getAccountReferenceBalancesInternal(args: {
  data: AccountReferenceBalancesInput;
  skipAuthorization?: boolean;
}) {
  const { data, skipAuthorization = false } = args;

  if (!skipAuthorization) {
    await ensureAuthorizedForAccountBookId(data.accountBookId);
  }
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

export const getAccounts = createServerFn({ method: "GET" })
  .inputValidator((data: { accountBookId: string }) => data)
  .handler(async ({ data }) => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);
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
    const resolveGroupPath = createGroupPathResolver(allGroups);
    return accounts
      .map((a) => ({
        ...a,
        groupPath: a.groupId ? resolveGroupPath(a.groupId) : "",
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
    await ensureAuthorizedForAccountBookId(data.accountBookId);
    return getAccountGroupsInternal(data.accountBookId);
  });

export const getExistingNodes = createServerFn({ method: "GET" })
  .inputValidator((data: { accountBookId: string }) => data)
  .handler(async ({ data }) => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);
    return getExistingNodesInternal(data.accountBookId);
  });

export const getAccountTreeData = createServerFn({ method: "GET" })
  .inputValidator((data: AccountTreeDataInput) => data)
  .handler(async ({ data }) => {
    return getAccountTreeDataInternal({ data });
  });

export const getAccountsPageData = createServerFn({ method: "GET" })
  .inputValidator(
    (data: {
      accountBookId: string;
      type?: AccountType;
      equityAccountSubtype?: EquityAccountSubtype;
      accountState?: AccountState;
    }) => data,
  )
  .handler(async ({ data }) => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);
    const accountState = data.accountState ?? "active";

    const [treeData, accountGroups, existingNodes] = await Promise.all([
      getAccountTreeDataInternal({
        data: {
          accountBookId: data.accountBookId,
          accountState,
          type: data.type,
          equityAccountSubtype: data.equityAccountSubtype,
          includeReferenceBalances: false,
        },
        skipAuthorization: true,
      }),
      accountState === "active"
        ? getAccountGroupsInternal(data.accountBookId)
        : Promise.resolve([]),
      accountState === "active"
        ? getExistingNodesInternal(data.accountBookId)
        : Promise.resolve([]),
    ]);

    return {
      accountGroups,
      existingNodes,
      referenceCurrency: treeData.referenceCurrency,
      rows: treeData.rows,
    };
  });

export const getAccountReferenceBalances = createServerFn({ method: "GET" })
  .inputValidator((data: AccountReferenceBalancesInput) => data)
  .handler(async ({ data }) => {
    return getAccountReferenceBalancesInternal({ data });
  });
