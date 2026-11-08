import type { AccountReadClient } from "./read-client";
import {
  assetClassSelection,
  withAssetClassId,
} from "../../classification-data.server";
import { toMoney } from "../../../shared/money";
import { prisma } from "../../../prisma.server";
import {
  addUtcDays,
  getOpeningBalancesBookingDate,
  getUtcDayRange,
  startOfUtcDay,
} from "../../../shared/date";

import type {
  AccountTrackingMethod,
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../../../.prisma-client/enums";
import type { StatementImportCsvFormat } from "../../../shared/statement-import-csv-format";
import type { AccountState } from "./types";
import { getAccountsWhereClause } from "./reference-balance-valuation.server";

export type AccountTreeQueryAccount = {
  trackingMethod?: AccountTrackingMethod;
  assetClassId: string | null;

  id: string;
  name: string;
  type: AccountType;
  equityAccountSubtype: EquityAccountSubtype | null;
  unit: Unit | null;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
  statementImportCsvFormat?: StatementImportCsvFormat | null;
  isCashAccount: boolean;
  groupId: string | null;
  isActive: boolean;
  sortOrder: number | null;
};

export type AccountTreeQueryGroup = {
  id: string;
  name: string;
  type: AccountType;
  equityAccountSubtype: EquityAccountSubtype | null;
  isCashAccount: boolean;
  parentGroupId: string | null;
  isActive: boolean;
  sortOrder: number | null;
};

type AccountBookTreeMeta = {
  referenceCurrency: string;
  startDate: Date;
};

export async function fetchAccountTreeMetadata(
  accountBookId: string,
  db: AccountReadClient,
  scope?: {
    accountState: AccountState;
    type?: AccountType;
    equityAccountSubtype?: EquityAccountSubtype;
  },
) {
  const [accounts, accountGroups] = await Promise.all([
    db.account
      .findMany({
        where: scope
          ? getAccountsWhereClause({ accountBookId, ...scope })
          : { accountBookId },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: {
          id: true,
          classifications: assetClassSelection,
          trackingMethod: true,

          name: true,
          type: true,
          equityAccountSubtype: true,
          unit: true,
          currency: true,
          cryptocurrency: true,
          symbol: true,
          tradeCurrency: true,
          statementImportCsvFormat: true,
          isCashAccount: true,
          groupId: true,
          isActive: true,
          sortOrder: true,
        },
      })
      .then((accounts) =>
        accounts.map((account) => ({
          ...withAssetClassId(account),
          statementImportCsvFormat:
            account.statementImportCsvFormat as StatementImportCsvFormat | null,
        })),
      ),
    db.accountGroup.findMany({
      where: {
        accountBookId,
        type: scope?.type,
        ...(scope?.equityAccountSubtype
          ? {
              OR: [
                { equityAccountSubtype: scope.equityAccountSubtype },
                { equityAccountSubtype: null },
              ],
            }
          : {}),
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        type: true,
        equityAccountSubtype: true,
        isCashAccount: true,
        parentGroupId: true,
        isActive: true,
        sortOrder: true,
      },
    }),
  ]);
  return { accounts, accountGroups };
}

export type AccountTreeMetadata = Awaited<
  ReturnType<typeof fetchAccountTreeMetadata>
>;

export async function fetchAccountTreeQueryData(
  args: {
    accountBookId: string;
    accountState: AccountState;
    type?: AccountType;
    equityAccountSubtype?: EquityAccountSubtype;
    includeActionAvailability: boolean;
  },
  db: AccountReadClient = prisma,
  metadata?: AccountTreeMetadata,
) {
  const source =
    metadata ?? (await fetchAccountTreeMetadata(args.accountBookId, db, args));
  const [accounts, accountGroups] = metadata
    ? [
        metadata.accounts.filter(
          (account) =>
            (args.accountState === "all" ||
              account.isActive === (args.accountState === "active")) &&
            (args.type === undefined || account.type === args.type) &&
            (args.equityAccountSubtype === undefined ||
              account.equityAccountSubtype === args.equityAccountSubtype),
        ),
        metadata.accountGroups.filter(
          (group) =>
            (args.type === undefined || group.type === args.type) &&
            (args.equityAccountSubtype === undefined ||
              group.equityAccountSubtype === null ||
              group.equityAccountSubtype === args.equityAccountSubtype),
        ),
      ]
    : [source.accounts, source.accountGroups];
  const groupById = new Map(accountGroups.map((group) => [group.id, group]));

  const balanceAccountIds = accounts
    .filter((account) => account.type === "BALANCE")
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
      ? db.booking.groupBy({
          by: ["accountId"],
          where: {
            accountBookId: args.accountBookId,
            accountId: { in: accounts.map((account) => account.id) },
          },
          _count: true,
        })
      : Promise.resolve([]),
    balanceAccountIds.length > 0
      ? db.booking.groupBy({
          by: ["accountId"],
          where: {
            accountBookId: args.accountBookId,
            accountId: { in: balanceAccountIds },
            date: { lt: currentBalanceEndExclusive },
          },
          _sum: { value: true },
        })
      : Promise.resolve([]),
    balanceAccountIds.length > 0
      ? db.booking.groupBy({
          by: ["accountId"],
          where: {
            accountBookId: args.accountBookId,
            accountId: { in: balanceAccountIds },
          },
          _sum: { value: true },
        })
      : Promise.resolve([]),
    db.accountBook.findUniqueOrThrow({
      where: { id: args.accountBookId },
      select: {
        referenceCurrency: true,
        startDate: true,
      },
    }),
    args.includeActionAvailability
      ? metadata
        ? Promise.resolve(
            metadata.accounts.map((account) => ({
              groupId: account.groupId,
              _count: 1,
            })),
          )
        : db.account.groupBy({
            by: ["groupId"],
            where: { accountBookId: args.accountBookId },
            _count: true,
          })
      : Promise.resolve([]),
    args.includeActionAvailability
      ? metadata
        ? Promise.resolve(
            metadata.accountGroups.map((group) => ({
              parentGroupId: group.parentGroupId,
              _count: 1,
            })),
          )
        : db.accountGroup.groupBy({
            by: ["parentGroupId"],
            where: {
              accountBookId: args.accountBookId,
              parentGroupId: { not: null },
            },
            _count: true,
          })
      : Promise.resolve([]),
    args.includeActionAvailability
      ? metadata
        ? Promise.resolve(
            metadata.accounts
              .filter((account) => account.isActive)
              .map((account) => ({ groupId: account.groupId, _count: 1 })),
          )
        : db.account.groupBy({
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
      ? metadata
        ? Promise.resolve(
            metadata.accountGroups
              .filter((group) => group.isActive)
              .map((group) => ({
                parentGroupId: group.parentGroupId,
                _count: 1,
              })),
          )
        : db.accountGroup.groupBy({
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
      toMoney(balance._sum.value ?? toMoney(0)),
    ]),
  );
  const allScheduledRawBalanceByAccountId = new Map(
    allScheduledAccountBalances.map((balance) => [
      balance.accountId,
      toMoney(balance._sum.value ?? toMoney(0)),
    ]),
  );
  const openingBalanceDate = getOpeningBalancesBookingDate(
    accountBook.startDate,
  );
  const openingBalanceRange = getUtcDayRange(openingBalanceDate);
  const openingBalanceSums =
    balanceAccountIds.length > 0
      ? await db.booking.groupBy({
          by: ["accountId"],
          where: {
            accountBookId: args.accountBookId,
            accountId: { in: balanceAccountIds },
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
      toMoney(balance._sum.value ?? toMoney(0)),
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
      isCashAccount: true,
    },
  });

  const balanceAccountIds = accounts
    .filter((account) => account.type === "BALANCE")
    .map((account) => account.id);
  const currentBalanceEndExclusive = addUtcDays(startOfUtcDay(new Date()), 1);

  const [accountBalances, accountBook] = await Promise.all([
    balanceAccountIds.length > 0
      ? prisma.booking.groupBy({
          by: ["accountId"],
          where: {
            accountBookId: args.accountBookId,
            accountId: { in: balanceAccountIds },
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
      toMoney(balance._sum.value ?? toMoney(0)),
    ]),
  );

  return {
    accounts,
    rawBalanceByAccountId,
    referenceCurrency: accountBook.referenceCurrency.toUpperCase(),
  };
}
