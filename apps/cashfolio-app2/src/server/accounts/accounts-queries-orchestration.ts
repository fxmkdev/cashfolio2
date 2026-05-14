import { prisma } from "../../prisma.server";
import type {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../../.prisma-client/enums";
import {
  createGroupPathSegmentsResolver,
  getGroupHierarchy,
  hasInactiveAncestorGroup,
} from "../accounts/accounts-helpers";
import {
  getOpeningBalancesBookingDate,
  getUtcDayRange,
} from "../../shared/date";
import { moneyIsZero, toMoneyNumber } from "../../shared/money";
import {
  type AccountState,
  getDisplayBalanceInReferenceCurrencyByAccountId,
} from "./accounts-queries-reference-balances";
import {
  createAccountBookUnitUsage,
  type AccountBookUnitUsage,
} from "../../shared/account-book-unit-usage";
import {
  fetchAccountReferenceBalancesQueryData,
  fetchAccountTreeQueryData,
} from "./accounts-queries-tree-data";
import { buildAccountTreeGroupActionAvailabilitySets } from "./accounts-tree-action-availability";
import {
  accountTypeRequiresZeroBalanceForArchive,
  getAccountArchiveAvailability,
  getAccountDeleteAvailability,
  getAccountUnarchiveAvailability,
} from "./account-tree-rules";
import {
  type AccountTreeRow,
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

export type LedgerAccountActionDataInput = {
  accountBookId: string;
  accountId: string;
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
  const resolveGroupPathSegments = createGroupPathSegmentsResolver(groups);
  return groups
    .map((group) => {
      const pathSegments = resolveGroupPathSegments(group.id);

      return {
        value: group.id,
        label: pathSegments.join(" / "),
        type: group.type,
        equityAccountSubtype: group.equityAccountSubtype,
        parentGroupId: group.parentGroupId,
        treePath: pathSegments.slice(0, -1),
        treeLabel: group.name,
      };
    })
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

export async function queryActiveAccountBookUnitUsage(
  accountBookId: string,
): Promise<AccountBookUnitUsage> {
  const [accountBook, accounts] = await Promise.all([
    prisma.accountBook.findUniqueOrThrow({
      where: { id: accountBookId },
      select: { referenceCurrency: true },
    }),
    prisma.account.findMany({
      where: {
        accountBookId,
        isActive: true,
      },
      select: {
        isActive: true,
        currency: true,
        cryptocurrency: true,
        tradeCurrency: true,
      },
    }),
  ]);

  return createAccountBookUnitUsage({
    referenceCurrency: accountBook.referenceCurrency,
    accounts,
  });
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

export async function queryLedgerAccountActionData(
  data: LedgerAccountActionDataInput,
): Promise<AccountTreeRow> {
  const [account, accountBook, bookingAggregate, bookingCount, groupById] =
    await Promise.all([
      prisma.account.findUnique({
        where: {
          id_accountBookId: {
            id: data.accountId,
            accountBookId: data.accountBookId,
          },
        },
        select: {
          id: true,
          name: true,
          type: true,
          equityAccountSubtype: true,
          unit: true,
          currency: true,
          cryptocurrency: true,
          symbol: true,
          tradeCurrency: true,
          groupId: true,
          isActive: true,
          sortOrder: true,
        },
      }),
      prisma.accountBook.findUniqueOrThrow({
        where: { id: data.accountBookId },
        select: { startDate: true },
      }),
      prisma.booking.aggregate({
        where: {
          accountBookId: data.accountBookId,
          accountId: data.accountId,
        },
        _sum: { value: true },
      }),
      prisma.booking.count({
        where: {
          accountBookId: data.accountBookId,
          accountId: data.accountId,
        },
      }),
      getGroupHierarchy(data.accountBookId),
    ]);

  if (!account) {
    throw new Error(
      `Ledger account action data not found for accountId=${data.accountId}, accountBookId=${data.accountBookId}.`,
    );
  }

  const requiresZeroBalance = accountTypeRequiresZeroBalanceForArchive(
    account.type,
  );
  const rawBalance = toMoneyNumber(bookingAggregate._sum.value ?? 0);
  const hasZeroBalance =
    !requiresZeroBalance || moneyIsZero(bookingAggregate._sum.value ?? 0);
  const deleteAvailability = getAccountDeleteAvailability(bookingCount > 0);
  const archiveAvailability = getAccountArchiveAvailability({
    isActive: account.isActive,
    hasZeroBalance,
  });
  const unarchiveAvailability = getAccountUnarchiveAvailability({
    isActive: account.isActive,
    hasInactiveAncestor: hasInactiveAncestorGroup(account.groupId, groupById),
  });
  const openingBalanceRange = getUtcDayRange(
    getOpeningBalancesBookingDate(accountBook.startDate),
  );
  const openingBalanceAggregate = requiresZeroBalance
    ? await prisma.booking.aggregate({
        where: {
          accountBookId: data.accountBookId,
          accountId: data.accountId,
          date: {
            gte: openingBalanceRange.start,
            lt: openingBalanceRange.endExclusive,
          },
        },
        _sum: { value: true },
      })
    : null;
  const openingRawBalance =
    openingBalanceAggregate?._sum.value == null
      ? null
      : toMoneyNumber(openingBalanceAggregate._sum.value);

  return {
    id: account.id,
    nodeType: "account",
    name: account.name,
    type: account.type,
    equityAccountSubtype: account.equityAccountSubtype,
    unit: account.unit as Unit | null,
    currency: account.currency as string | null,
    cryptocurrency: account.cryptocurrency as string | null,
    symbol: account.symbol as string | null,
    tradeCurrency: account.tradeCurrency as string | null,
    balance:
      account.type === "ASSET"
        ? rawBalance
        : account.type === "LIABILITY"
          ? -rawBalance
          : null,
    balanceInReferenceCurrency: null,
    openingBalance:
      openingRawBalance == null
        ? null
        : account.type === "ASSET"
          ? openingRawBalance
          : account.type === "LIABILITY"
            ? -openingRawBalance
            : null,
    parentId: account.groupId ?? undefined,
    isActive: account.isActive,
    groupId: account.groupId ?? undefined,
    sortOrder: account.sortOrder,
    deletable: deleteAvailability.enabled,
    deleteDisabledReason: deleteAvailability.disabledReason,
    archivable: archiveAvailability.enabled,
    archiveDisabledReason: archiveAvailability.disabledReason,
    unarchivable: unarchiveAvailability.enabled,
    unarchiveDisabledReason: unarchiveAvailability.disabledReason,
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

  const [treeData, accountGroups, existingNodes, unitUsage] = await Promise.all(
    [
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
      queryActiveAccountBookUnitUsage(data.accountBookId),
    ],
  );

  return {
    accountGroups,
    existingNodes,
    referenceCurrency: treeData.referenceCurrency,
    unitUsage,
    rows: treeData.rows,
  };
}
