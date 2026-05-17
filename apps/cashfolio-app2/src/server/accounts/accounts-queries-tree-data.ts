import { prisma } from "../../prisma.server";
import {
  addUtcDays,
  getOpeningBalancesBookingDate,
  getUtcDayRange,
  startOfUtcDay,
} from "../../shared/date";
import { toMoneyNumber } from "../../shared/money";
import type {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../../.prisma-client/enums";
import type { AccountState } from "./accounts-queries-reference-balances";
import { getAccountsWhereClause } from "./accounts-queries-reference-balances";

export type AccountTreeQueryAccount = {
  id: string;
  name: string;
  type: AccountType;
  equityAccountSubtype: EquityAccountSubtype | null;
  unit: Unit | null;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
  groupId: string | null;
  isActive: boolean;
  sortOrder: number | null;
};

export type AccountTreeQueryGroup = {
  id: string;
  name: string;
  type: AccountType;
  equityAccountSubtype: EquityAccountSubtype | null;
  parentGroupId: string | null;
  isActive: boolean;
  sortOrder: number | null;
};

type AccountBookTreeMeta = {
  referenceCurrency: string;
  startDate: Date;
};

export async function fetchAccountTreeQueryData(args: {
  accountBookId: string;
  accountState: AccountState;
  type?: AccountType;
  equityAccountSubtype?: EquityAccountSubtype;
  includeActionAvailability: boolean;
}) {
  const [accounts, accountGroups] = await Promise.all([
    prisma.account.findMany({
      where: getAccountsWhereClause({
        accountBookId: args.accountBookId,
        accountState: args.accountState,
        type: args.type,
        equityAccountSubtype: args.equityAccountSubtype,
      }),
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
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
    prisma.accountGroup.findMany({
      where: {
        accountBookId: args.accountBookId,
        type: args.type,
        ...(args.equityAccountSubtype
          ? {
              OR: [
                { equityAccountSubtype: args.equityAccountSubtype },
                { equityAccountSubtype: null },
              ],
            }
          : undefined),
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        type: true,
        equityAccountSubtype: true,
        parentGroupId: true,
        isActive: true,
        sortOrder: true,
      },
    }),
  ]);
  const groupById = new Map(accountGroups.map((group) => [group.id, group]));

  const assetAndLiabilityAccountIds = accounts
    .filter(
      (account) => account.type === "ASSET" || account.type === "LIABILITY",
    )
    .map((account) => account.id);
  const currentBalanceEndExclusive = addUtcDays(startOfUtcDay(new Date()), 1);

  const [
    bookingCounts,
    accountBalances,
    allScheduledAccountBalances,
    accountBook,
    allAccountsForGroup,
    allGroupsForParent,
    activeAccountsForGroup,
    activeGroupsForParent,
  ] = await Promise.all([
    args.includeActionAvailability
      ? prisma.booking.groupBy({
          by: ["accountId"],
          where: {
            accountBookId: args.accountBookId,
            accountId: { in: accounts.map((account) => account.id) },
          },
          _count: true,
        })
      : Promise.resolve([]),
    assetAndLiabilityAccountIds.length > 0
      ? prisma.booking.groupBy({
          by: ["accountId"],
          where: {
            accountBookId: args.accountBookId,
            accountId: { in: assetAndLiabilityAccountIds },
            date: { lt: currentBalanceEndExclusive },
          },
          _sum: { value: true },
        })
      : Promise.resolve([]),
    assetAndLiabilityAccountIds.length > 0
      ? prisma.booking.groupBy({
          by: ["accountId"],
          where: {
            accountBookId: args.accountBookId,
            accountId: { in: assetAndLiabilityAccountIds },
          },
          _sum: { value: true },
        })
      : Promise.resolve([]),
    prisma.accountBook.findUniqueOrThrow({
      where: { id: args.accountBookId },
      select: {
        referenceCurrency: true,
        startDate: true,
      },
    }),
    args.includeActionAvailability
      ? prisma.account.groupBy({
          by: ["groupId"],
          where: { accountBookId: args.accountBookId },
          _count: true,
        })
      : Promise.resolve([]),
    args.includeActionAvailability
      ? prisma.accountGroup.groupBy({
          by: ["parentGroupId"],
          where: {
            accountBookId: args.accountBookId,
            parentGroupId: { not: null },
          },
          _count: true,
        })
      : Promise.resolve([]),
    args.includeActionAvailability
      ? prisma.account.groupBy({
          by: ["groupId"],
          where: {
            accountBookId: args.accountBookId,
            groupId: { not: null },
            isActive: true,
          },
          _count: true,
        })
      : Promise.resolve([]),
    args.includeActionAvailability
      ? prisma.accountGroup.groupBy({
          by: ["parentGroupId"],
          where: {
            accountBookId: args.accountBookId,
            parentGroupId: { not: null },
            isActive: true,
          },
          _count: true,
        })
      : Promise.resolve([]),
  ]);

  const rawBalanceByAccountId = new Map(
    accountBalances.map((balance) => [
      balance.accountId,
      toMoneyNumber(balance._sum.value ?? 0),
    ]),
  );
  const allScheduledRawBalanceByAccountId = new Map(
    allScheduledAccountBalances.map((balance) => [
      balance.accountId,
      toMoneyNumber(balance._sum.value ?? 0),
    ]),
  );
  const openingBalanceDate = getOpeningBalancesBookingDate(
    accountBook.startDate,
  );
  const openingBalanceRange = getUtcDayRange(openingBalanceDate);
  const openingBalanceSums =
    assetAndLiabilityAccountIds.length > 0
      ? await prisma.booking.groupBy({
          by: ["accountId"],
          where: {
            accountBookId: args.accountBookId,
            accountId: { in: assetAndLiabilityAccountIds },
            date: {
              gte: openingBalanceRange.start,
              lt: openingBalanceRange.endExclusive,
            },
          },
          _sum: { value: true },
        })
      : [];
  const openingRawBalanceByAccountId = new Map(
    openingBalanceSums.map((balance) => [
      balance.accountId,
      toMoneyNumber(balance._sum.value ?? 0),
    ]),
  );

  return {
    accounts,
    accountGroups,
    groupById,
    accountBook: accountBook as AccountBookTreeMeta,
    rawBalanceByAccountId,
    allScheduledRawBalanceByAccountId,
    openingRawBalanceByAccountId,
    bookingCounts,
    allAccountsForGroup,
    allGroupsForParent,
    activeAccountsForGroup,
    activeGroupsForParent,
  };
}

export async function fetchAccountReferenceBalancesQueryData(args: {
  accountBookId: string;
  accountState: AccountState;
  type?: AccountType;
  equityAccountSubtype?: EquityAccountSubtype;
}) {
  const accounts = await prisma.account.findMany({
    where: getAccountsWhereClause({
      accountBookId: args.accountBookId,
      accountState: args.accountState,
      type: args.type,
      equityAccountSubtype: args.equityAccountSubtype,
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
  const currentBalanceEndExclusive = addUtcDays(startOfUtcDay(new Date()), 1);

  const [accountBalances, accountBook] = await Promise.all([
    assetAndLiabilityAccountIds.length > 0
      ? prisma.booking.groupBy({
          by: ["accountId"],
          where: {
            accountBookId: args.accountBookId,
            accountId: { in: assetAndLiabilityAccountIds },
            date: { lt: currentBalanceEndExclusive },
          },
          _sum: { value: true },
        })
      : Promise.resolve([]),
    prisma.accountBook.findUniqueOrThrow({
      where: { id: args.accountBookId },
      select: {
        referenceCurrency: true,
      },
    }),
  ]);
  const rawBalanceByAccountId = new Map(
    accountBalances.map((balance) => [
      balance.accountId,
      toMoneyNumber(balance._sum.value ?? 0),
    ]),
  );

  return {
    accounts,
    rawBalanceByAccountId,
    referenceCurrency: accountBook.referenceCurrency.toUpperCase(),
  };
}
