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
  getAccountsWhereClause,
  getDisplayBalanceInReferenceCurrencyByAccountId,
} from "./accounts-queries-reference-balances";
import {
  buildAccountRows,
  buildGroupRows,
  filterGroupsForAccountState,
  sortAccountTreeRows,
} from "./accounts-tree-rows";

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

  const [accounts, accountGroups] = await Promise.all([
    prisma.account.findMany({
      where: getAccountsWhereClause({
        accountBookId: data.accountBookId,
        accountState,
        type: data.type,
        equityAccountSubtype: data.equityAccountSubtype,
      }),
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
  const groupById = new Map(accountGroups.map((g) => [g.id, g]));

  const assetAndLiabilityAccountIds = accounts
    .filter((a) => a.type === "ASSET" || a.type === "LIABILITY")
    .map((a) => a.id);

  const [
    bookingCounts,
    accountBalances,
    accountBook,
    allAccountsForGroup,
    allGroupsForParent,
    activeAccountsForGroup,
    activeGroupsForParent,
  ] = await Promise.all([
    includeActionAvailability
      ? prisma.booking.groupBy({
          by: ["accountId"],
          where: {
            accountBookId: data.accountBookId,
            accountId: { in: accounts.map((a) => a.id) },
          },
          _count: true,
        })
      : Promise.resolve([]),
    assetAndLiabilityAccountIds.length > 0
      ? prisma.booking.groupBy({
          by: ["accountId"],
          where: {
            accountBookId: data.accountBookId,
            accountId: { in: assetAndLiabilityAccountIds },
          },
          _sum: { value: true },
        })
      : Promise.resolve([]),
    prisma.accountBook.findUniqueOrThrow({
      where: { id: data.accountBookId },
      select: {
        referenceCurrency: true,
        securityHoldingGainLossAccountGroupId: true,
        cryptoHoldingGainLossAccountGroupId: true,
        fxHoldingGainLossAccountGroupId: true,
      },
    }),
    includeActionAvailability
      ? prisma.account.groupBy({
          by: ["groupId"],
          where: { accountBookId: data.accountBookId },
          _count: true,
        })
      : Promise.resolve([]),
    includeActionAvailability
      ? prisma.accountGroup.groupBy({
          by: ["parentGroupId"],
          where: {
            accountBookId: data.accountBookId,
            parentGroupId: { not: null },
          },
          _count: true,
        })
      : Promise.resolve([]),
    includeActionAvailability
      ? prisma.account.groupBy({
          by: ["groupId"],
          where: {
            accountBookId: data.accountBookId,
            groupId: { not: null },
            isActive: true,
          },
          _count: true,
        })
      : Promise.resolve([]),
    includeActionAvailability
      ? prisma.accountGroup.groupBy({
          by: ["parentGroupId"],
          where: {
            accountBookId: data.accountBookId,
            parentGroupId: { not: null },
            isActive: true,
          },
          _count: true,
        })
      : Promise.resolve([]),
  ]);

  const bookingCountByAccountId = new Map(
    bookingCounts.map((b) => [b.accountId, b._count]),
  );
  const rawBalanceByAccountId = new Map(
    accountBalances.map((b) => [b.accountId, Number(b._sum.value ?? 0)]),
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

  const referencedByAccountBook = new Set(
    [
      accountBook.securityHoldingGainLossAccountGroupId,
      accountBook.cryptoHoldingGainLossAccountGroupId,
      accountBook.fxHoldingGainLossAccountGroupId,
    ].filter(Boolean) as string[],
  );

  const accountCountByGroupId = new Set(
    allAccountsForGroup
      .filter((a) => a._count > 0 && a.groupId)
      .map((a) => a.groupId)
      .filter((groupId): groupId is string => groupId != null),
  );
  const groupsWithChildren = new Set(
    allGroupsForParent
      .filter((g) => g._count > 0 && g.parentGroupId)
      .map((g) => g.parentGroupId!),
  );
  const groupsWithActiveAccounts = new Set(
    activeAccountsForGroup
      .filter((a) => a._count > 0 && a.groupId)
      .map((a) => a.groupId)
      .filter((groupId): groupId is string => groupId != null),
  );
  const groupsWithActiveChildGroups = new Set(
    activeGroupsForParent
      .filter((g) => g._count > 0 && g.parentGroupId)
      .map((g) => g.parentGroupId!),
  );

  const groupRows = buildGroupRows({
    groups: filteredGroups,
    groupById,
    includeActionAvailability,
    referencedByAccountBook,
    groupsWithChildAccounts: accountCountByGroupId,
    groupsWithChildGroups: groupsWithChildren,
    groupsWithActiveChildAccounts: groupsWithActiveAccounts,
    groupsWithActiveChildGroups: groupsWithActiveChildGroups,
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

  const accounts = await prisma.account.findMany({
    where: getAccountsWhereClause({
      accountBookId: data.accountBookId,
      accountState,
      type: data.type,
      equityAccountSubtype: data.equityAccountSubtype,
    }),
    select: {
      id: true,
      type: true,
      unit: true,
      currency: true,
      cryptocurrency: true,
      symbol: true,
      tradeCurrency: true,
    },
  });

  const assetAndLiabilityAccountIds = accounts
    .filter(
      (account) => account.type === "ASSET" || account.type === "LIABILITY",
    )
    .map((account) => account.id);

  const [accountBalances, accountBook] = await Promise.all([
    assetAndLiabilityAccountIds.length > 0
      ? prisma.booking.groupBy({
          by: ["accountId"],
          where: {
            accountBookId: data.accountBookId,
            accountId: { in: assetAndLiabilityAccountIds },
          },
          _sum: { value: true },
        })
      : Promise.resolve([]),
    prisma.accountBook.findUniqueOrThrow({
      where: { id: data.accountBookId },
      select: {
        referenceCurrency: true,
      },
    }),
  ]);
  const rawBalanceByAccountId = new Map(
    accountBalances.map((balance) => [
      balance.accountId,
      Number(balance._sum.value ?? 0),
    ]),
  );
  const referenceCurrency = accountBook.referenceCurrency.toUpperCase();
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
