import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../prisma.server";
import type {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../.prisma-client/enums";
import { ensureAuthorizedForAccountBookId } from "../account-books/functions.server";
import {
  getCryptocurrencyToCurrencyExchangeRate,
  getCurrencyExchangeRate,
  getSecurityToCurrencyExchangeRate,
} from "./fx.server";
import {
  createGroupPathResolver,
  hasInactiveAncestorGroup,
} from "./accounts-helpers";
import {
  accountTypeRequiresZeroBalanceForArchive,
  getAccountArchiveAvailability,
  getAccountDeleteAvailability,
  getAccountUnarchiveAvailability,
  getGroupArchiveAvailability,
  getGroupDeleteAvailability,
  getGroupUnarchiveAvailability,
} from "./account-tree-rules";

type AccountState = "active" | "inactive";

type AccountTreeDataInput = {
  accountBookId: string;
  type?: AccountType;
  equityAccountSubtype?: EquityAccountSubtype;
  accountState?: AccountState;
  includeReferenceBalances?: boolean;
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

type AccountReferenceBalanceSource = {
  id: string;
  type: AccountType;
  unit: Unit | null;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
};

function getAccountsWhereClause(args: {
  accountBookId: string;
  accountState: AccountState;
  type?: AccountType;
  equityAccountSubtype?: EquityAccountSubtype;
}) {
  return {
    accountBookId: args.accountBookId,
    isActive: args.accountState === "active",
    type: args.type,
    ...(args.equityAccountSubtype
      ? { equityAccountSubtype: args.equityAccountSubtype }
      : undefined),
  };
}

async function getDisplayBalanceInReferenceCurrencyByAccountId(args: {
  accounts: AccountReferenceBalanceSource[];
  rawBalanceByAccountId: Map<string, number>;
  referenceCurrency: string;
  includeReferenceBalances: boolean;
}): Promise<Map<string, number | null>> {
  const {
    accounts,
    rawBalanceByAccountId,
    referenceCurrency,
    includeReferenceBalances,
  } = args;

  if (!includeReferenceBalances) {
    return new Map(accounts.map((account) => [account.id, null] as const));
  }

  const today = new Date();
  const usdToReferenceRatePromise =
    referenceCurrency === "USD"
      ? Promise.resolve(1)
      : getCurrencyExchangeRate({
          sourceCurrency: "USD",
          targetCurrency: referenceCurrency,
          date: today,
        });
  const exchangeRateBySourceCurrency = new Map<
    string,
    Promise<number | null>
  >();
  const exchangeRateByCryptocurrency = new Map<
    string,
    Promise<number | null>
  >();
  const exchangeRateBySecurity = new Map<string, Promise<number | null>>();

  return new Map(
    await Promise.all(
      accounts.map(async (account) => {
        const rawBalance = rawBalanceByAccountId.get(account.id) ?? 0;
        let rawBalanceInReferenceCurrency: number | null = null;
        const isAssetOrLiability =
          account.type === "ASSET" || account.type === "LIABILITY";
        const shouldComputeCurrencyReferenceBalance =
          isAssetOrLiability &&
          account.unit === "CURRENCY" &&
          Boolean(account.currency);
        const shouldComputeCryptocurrencyReferenceBalance =
          isAssetOrLiability &&
          account.unit === "CRYPTOCURRENCY" &&
          Boolean(account.cryptocurrency);
        const shouldComputeSecurityReferenceBalance =
          isAssetOrLiability &&
          account.unit === "SECURITY" &&
          Boolean(account.symbol) &&
          Boolean(account.tradeCurrency);

        if (shouldComputeCurrencyReferenceBalance && account.currency) {
          const sourceCurrency = account.currency.toUpperCase();
          if (rawBalance === 0) {
            rawBalanceInReferenceCurrency = 0;
          } else if (sourceCurrency === referenceCurrency) {
            rawBalanceInReferenceCurrency = rawBalance;
          } else {
            const existingPromise =
              exchangeRateBySourceCurrency.get(sourceCurrency);
            const exchangeRatePromise =
              existingPromise ??
              (async () => {
                const [usdToReferenceRate, sourceToUsdRate] = await Promise.all(
                  [
                    usdToReferenceRatePromise,
                    getCurrencyExchangeRate({
                      sourceCurrency,
                      targetCurrency: "USD",
                      date: today,
                    }),
                  ],
                );
                if (usdToReferenceRate == null || sourceToUsdRate == null) {
                  return null;
                }
                return sourceToUsdRate * usdToReferenceRate;
              })();
            if (!existingPromise) {
              exchangeRateBySourceCurrency.set(
                sourceCurrency,
                exchangeRatePromise,
              );
            }

            const exchangeRate = await exchangeRatePromise;
            if (exchangeRate != null) {
              rawBalanceInReferenceCurrency = rawBalance * exchangeRate;
            }
          }
        } else if (
          shouldComputeCryptocurrencyReferenceBalance &&
          account.cryptocurrency
        ) {
          const cryptocurrency = account.cryptocurrency.toUpperCase();
          if (rawBalance === 0) {
            rawBalanceInReferenceCurrency = 0;
          } else {
            const existingPromise =
              exchangeRateByCryptocurrency.get(cryptocurrency);
            const exchangeRatePromise =
              existingPromise ??
              getCryptocurrencyToCurrencyExchangeRate({
                cryptocurrency,
                targetCurrency: referenceCurrency,
                date: today,
              });
            if (!existingPromise) {
              exchangeRateByCryptocurrency.set(
                cryptocurrency,
                exchangeRatePromise,
              );
            }

            const exchangeRate = await exchangeRatePromise;
            if (exchangeRate != null) {
              rawBalanceInReferenceCurrency = rawBalance * exchangeRate;
            }
          }
        } else if (
          shouldComputeSecurityReferenceBalance &&
          account.symbol &&
          account.tradeCurrency
        ) {
          const symbol = account.symbol.toUpperCase();
          const tradeCurrency = account.tradeCurrency.toUpperCase();
          if (rawBalance === 0) {
            rawBalanceInReferenceCurrency = 0;
          } else {
            const securityKey = `${symbol}:${tradeCurrency}:${referenceCurrency}`;
            const existingPromise = exchangeRateBySecurity.get(securityKey);
            const exchangeRatePromise =
              existingPromise ??
              getSecurityToCurrencyExchangeRate({
                symbol,
                tradeCurrency,
                targetCurrency: referenceCurrency,
                date: today,
              });
            if (!existingPromise) {
              exchangeRateBySecurity.set(securityKey, exchangeRatePromise);
            }

            const exchangeRate = await exchangeRatePromise;
            if (exchangeRate != null) {
              rawBalanceInReferenceCurrency = rawBalance * exchangeRate;
            }
          }
        }

        const displayBalanceInReferenceCurrency =
          rawBalanceInReferenceCurrency == null
            ? null
            : account.type === "ASSET"
              ? rawBalanceInReferenceCurrency
              : account.type === "LIABILITY"
                ? -rawBalanceInReferenceCurrency
                : null;

        return [account.id, displayBalanceInReferenceCurrency] as const;
      }),
    ),
  );
}

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
    prisma.booking.groupBy({
      by: ["accountId"],
      where: {
        accountBookId: data.accountBookId,
        accountId: { in: accounts.map((a) => a.id) },
      },
      _count: true,
    }),
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
    prisma.account.groupBy({
      by: ["groupId"],
      where: { accountBookId: data.accountBookId },
      _count: true,
    }),
    prisma.accountGroup.groupBy({
      by: ["parentGroupId"],
      where: {
        accountBookId: data.accountBookId,
        parentGroupId: { not: null },
      },
      _count: true,
    }),
    prisma.account.groupBy({
      by: ["groupId"],
      where: {
        accountBookId: data.accountBookId,
        groupId: { not: null },
        isActive: true,
      },
      _count: true,
    }),
    prisma.accountGroup.groupBy({
      by: ["parentGroupId"],
      where: {
        accountBookId: data.accountBookId,
        parentGroupId: { not: null },
        isActive: true,
      },
      _count: true,
    }),
  ]);

  const bookingCountByAccountId = new Map(
    bookingCounts.map((b) => [b.accountId, b._count]),
  );
  const rawBalanceByAccountId = new Map(
    accountBalances.map((b) => [b.accountId, Number(b._sum.value ?? 0)]),
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
      includeReferenceBalances,
    });

  const accountRows = accounts.map((a) => {
    const rawBalance = rawBalanceByAccountId.get(a.id) ?? 0;

    const hasBookings = (bookingCountByAccountId.get(a.id) ?? 0) > 0;
    const requiresZeroBalance = accountTypeRequiresZeroBalanceForArchive(
      a.type,
    );
    const hasZeroBalance = !requiresZeroBalance || rawBalance === 0;
    const hasInactiveAncestor = hasInactiveAncestorGroup(a.groupId, groupById);
    const deleteAvailability = getAccountDeleteAvailability(hasBookings);
    const archiveAvailability = getAccountArchiveAvailability({
      isActive: a.isActive,
      hasZeroBalance,
    });
    const unarchiveAvailability = getAccountUnarchiveAvailability({
      isActive: a.isActive,
      hasInactiveAncestor,
    });
    const displayBalance =
      a.type === "ASSET"
        ? rawBalance
        : a.type === "LIABILITY"
          ? -rawBalance
          : null;
    const displayBalanceInReferenceCurrency =
      displayBalanceInReferenceCurrencyByAccountId.get(a.id) ?? null;

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
      balance: displayBalance as number | null,
      balanceInReferenceCurrency: displayBalanceInReferenceCurrency,
      parentId: a.groupId ?? undefined,
      isActive: a.isActive,
      groupId: a.groupId ?? undefined,
      sortOrder: a.sortOrder,
      deletable: deleteAvailability.enabled,
      deleteDisabledReason: deleteAvailability.disabledReason,
      archivable: archiveAvailability.enabled,
      archiveDisabledReason: archiveAvailability.disabledReason,
      unarchivable: unarchiveAvailability.enabled,
      unarchiveDisabledReason: unarchiveAvailability.disabledReason,
    };
  });

  let filteredGroups = accountGroups.filter((g) => g.isActive);
  if (accountState === "inactive") {
    const groupsById = new Map(accountGroups.map((g) => [g.id, g]));
    const groupsToInclude = new Set<string>();

    for (const group of accountGroups) {
      if (!group.isActive) {
        let currentGroupId: string | null = group.id;
        while (currentGroupId) {
          groupsToInclude.add(currentGroupId);
          currentGroupId =
            groupsById.get(currentGroupId)?.parentGroupId ?? null;
        }
      }
    }
    for (const account of accounts) {
      let currentGroupId = account.groupId;
      while (currentGroupId) {
        groupsToInclude.add(currentGroupId);
        currentGroupId = groupsById.get(currentGroupId)?.parentGroupId ?? null;
      }
    }

    filteredGroups = accountGroups.filter((g) => groupsToInclude.has(g.id));
  }

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
      .map((a) => a.groupId),
  );
  const groupsWithChildren = new Set(
    allGroupsForParent
      .filter((g) => g._count > 0 && g.parentGroupId)
      .map((g) => g.parentGroupId!),
  );
  const groupsWithActiveAccounts = new Set(
    activeAccountsForGroup
      .filter((a) => a._count > 0 && a.groupId)
      .map((a) => a.groupId),
  );
  const groupsWithActiveChildGroups = new Set(
    activeGroupsForParent
      .filter((g) => g._count > 0 && g.parentGroupId)
      .map((g) => g.parentGroupId!),
  );

  const groupRows = filteredGroups.map((ag) => {
    const hasChildAccounts = accountCountByGroupId.has(ag.id);
    const hasChildGroups = groupsWithChildren.has(ag.id);
    const hasActiveChildAccounts = groupsWithActiveAccounts.has(ag.id);
    const hasActiveChildGroups = groupsWithActiveChildGroups.has(ag.id);
    const hasInactiveAncestor = hasInactiveAncestorGroup(
      ag.parentGroupId,
      groupById,
    );
    const isReferencedByAccountBook = referencedByAccountBook.has(ag.id);
    const deleteAvailability = getGroupDeleteAvailability({
      hasChildAccounts,
      hasChildGroups,
      isReferencedByAccountBook,
    });
    const archiveAvailability = getGroupArchiveAvailability({
      isActive: ag.isActive,
      hasActiveChildAccounts,
      hasActiveChildGroups,
    });
    const unarchiveAvailability = getGroupUnarchiveAvailability({
      isActive: ag.isActive,
      hasInactiveAncestor,
    });
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
      balance: null as number | null,
      balanceInReferenceCurrency: null as number | null,
      parentId: ag.parentGroupId ?? undefined,
      isActive: ag.isActive,
      groupId: ag.id,
      sortOrder: ag.sortOrder,
      deletable: deleteAvailability.enabled,
      deleteDisabledReason: deleteAvailability.disabledReason,
      archivable: archiveAvailability.enabled,
      archiveDisabledReason: archiveAvailability.disabledReason,
      unarchivable: unarchiveAvailability.enabled,
      unarchiveDisabledReason: unarchiveAvailability.disabledReason,
    };
  });

  const allRows = [...accountRows, ...groupRows];
  allRows.sort((a, b) => {
    const parentA = a.parentId ?? "";
    const parentB = b.parentId ?? "";
    if (parentA !== parentB) return parentA.localeCompare(parentB);
    if (a.sortOrder !== b.sortOrder) {
      if (a.sortOrder == null) return 1;
      if (b.sortOrder == null) return -1;
      return a.sortOrder - b.sortOrder;
    }
    return a.name.localeCompare(b.name);
  });
  return {
    referenceCurrency: accountBook.referenceCurrency.toUpperCase(),
    rows: allRows,
  };
}

export async function getAccountReferenceBalancesInternal(args: {
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
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
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
