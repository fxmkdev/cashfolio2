import { formatUnitLabel } from "../period/period-unit-format";
import { AccountType } from "../../.prisma-client/enums";
import { prisma } from "../../prisma.server";
import { toMoney, type Money } from "../../shared/money";
import { addUtcDays, startOfUtcDay } from "../../shared/date";
import {
  getExplicitPeriodDateRange,
  parseExplicitPeriodSelection,
} from "../../shared/period";
import {
  aggregateAccountGainLoss,
  EMPTY_GAIN_LOSS_SUMMARY,
  type AccountGainLossResult,
} from "../../shared/account-gain-loss";
import { toNumericMoney } from "../money-boundary";
import { filterConvertibleHoldingAccounts } from "../period/period-helpers";
import {
  convertBookingValueToReference,
  getUnitToReferenceExchangeRate,
} from "../period/period-conversion";
import { loadPeriodHoldingTransactionsRaw } from "../period/base-data/period-base-data-holding-transactions.server";
import type { PeriodReadClient } from "../period/base-data/period-read-client";
import { calculateAccountGainLoss } from "./account-gain-loss-calculation.server";

export function resolveAccountGainLossDate(period?: string, now = new Date()) {
  const today = startOfUtcDay(now);
  if (!period) return today;
  const selection = parseExplicitPeriodSelection(period);
  if (!selection) throw new Error("Invalid account G/L period");
  const periodEnd = addUtcDays(
    getExplicitPeriodDateRange(selection).toExclusive,
    -1,
  );
  return periodEnd < today ? periodEnd : today;
}

async function loadAccountGainLossInputs(
  args: { accountBookId: string; period?: string },
  db: PeriodReadClient,
) {
  const [book, accounts, groups] = await Promise.all([
    db.accountBook.findUniqueOrThrow({
      where: { id: args.accountBookId },
      select: { startDate: true, referenceCurrency: true },
    }),
    db.account.findMany({
      where: {
        accountBookId: args.accountBookId,
        type: { in: [AccountType.ASSET, AccountType.LIABILITY] },
      },
      select: {
        id: true,
        name: true,
        type: true,
        groupId: true,
        isActive: true,
        unit: true,
        currency: true,
        cryptocurrency: true,
        symbol: true,
        tradeCurrency: true,
      },
    }),
    db.accountGroup.findMany({
      where: { accountBookId: args.accountBookId },
      select: { id: true, parentGroupId: true, type: true },
    }),
  ]);
  const startDate = startOfUtcDay(book.startDate);
  const asOfDate = resolveAccountGainLossDate(args.period);
  const referenceCurrency = book.referenceCurrency.toUpperCase();
  const holdingAccounts = filterConvertibleHoldingAccounts(
    accounts,
    referenceCurrency,
  );
  const holdingIds = holdingAccounts.map((account) => account.id);
  const [initialBalances, transactions, pendingBookings] = await Promise.all([
    db.booking.groupBy({
      by: ["accountId"],
      where: {
        accountBookId: args.accountBookId,
        accountId: { in: holdingIds },
        date: { lt: startDate },
      },
      _sum: { value: true },
    }),
    asOfDate < startDate
      ? Promise.resolve([])
      : loadPeriodHoldingTransactionsRaw(
          {
            accountBookId: args.accountBookId,
            holdingAccountIds: holdingIds,
            queryStart: startDate,
            queryEndExclusive: addUtcDays(asOfDate, 1),
          },
          db,
        ),
    db.booking.findMany({
      where: {
        accountBookId: args.accountBookId,
        accountId: { in: holdingIds },
        date: { gte: startDate, lt: addUtcDays(asOfDate, 1) },
        transaction: {
          bookings: { some: { date: { gte: addUtcDays(asOfDate, 1) } } },
        },
      },
      select: { accountId: true },
    }),
  ]);
  return {
    accounts,
    groups,
    startDate,
    asOfDate,
    referenceCurrency,
    holdingAccounts,
    initialBalances,
    transactions,
    pendingBookings,
  };
}

async function loadAccountGainLossRange(args: {
  accountBookId: string;
  period?: string;
  detailAccountId?: string;
}) {
  const {
    accounts,
    groups,
    startDate,
    asOfDate,
    referenceCurrency,
    holdingAccounts,
    initialBalances,
    transactions,
    pendingBookings,
  } = await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      return loadAccountGainLossInputs(args, tx);
    },
    { isolationLevel: "RepeatableRead", timeout: 30_000 },
  );
  const exchangeRateByKey = new Map<string, Promise<Money | null>>();
  const calculated = await calculateAccountGainLoss({
    holdingAccounts,
    unavailableHoldings: pendingBookings.map((booking) => booking.accountId),
    initialBalanceByAccountId:
      asOfDate < startDate
        ? new Map()
        : new Map(
            initialBalances.map((row) => [
              row.accountId,
              toMoney(row._sum.value ?? 0),
            ]),
          ),
    transactions,
    periodStart: startDate,
    periodEndExclusive: addUtcDays(asOfDate, 1),
    initialRateDate: addUtcDays(startDate, -1),
    periodEnd: asOfDate,
    detailAccountId: args.detailAccountId,
    resolveRate: (input) =>
      getUnitToReferenceExchangeRate({
        ...input,
        referenceCurrency,
        exchangeRateByKey,
      }),
    convertBookingToReference: (booking) =>
      convertBookingValueToReference({
        ...booking,
        referenceCurrency,
        exchangeRateByKey,
      }),
  });
  for (const account of accounts) {
    if (calculated.results.has(account.id)) continue;
    const applicable = !(
      account.unit === "CURRENCY" &&
      account.currency?.toUpperCase() === referenceCurrency
    );
    calculated.results.set(account.id, {
      applicable,
      summary: { ...EMPTY_GAIN_LOSS_SUMMARY },
      diagnostics: applicable
        ? [
            {
              date: asOfDate.toISOString(),
              message: "Account unit metadata is incomplete.",
            },
          ]
        : [],
    });
  }
  return {
    ...calculated,
    accounts,
    groups,
    referenceCurrency,
    startDate: startDate.toISOString(),
    asOfDate: asOfDate.toISOString(),
  };
}

export async function queryAccountGainLossSummaries(args: {
  accountBookId: string;
  type: "ASSET" | "LIABILITY";
  accountState: "active" | "inactive";
}) {
  const range = await loadAccountGainLossRange(args);
  const groups = range.groups.filter((group) => group.type === args.type);
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const selectedAccounts = range.accounts.filter(
    (account) =>
      account.type === args.type &&
      account.isActive === (args.accountState === "active"),
  );
  const descendants = new Map<string, AccountGainLossResult<Money>[]>();
  const rows = selectedAccounts.map((account) => {
    const result = range.results.get(account.id)!;
    let groupId = account.groupId;
    const visited = new Set<string>();
    while (groupId && !visited.has(groupId)) {
      visited.add(groupId);
      const children = descendants.get(groupId) ?? [];
      children.push(result);
      descendants.set(groupId, children);
      groupId = groupById.get(groupId)?.parentGroupId ?? null;
    }
    return { id: account.id, ...result };
  });
  const groupRows = groups.map((group) => ({
    id: group.id,
    ...aggregateAccountGainLoss(descendants.get(group.id) ?? []),
  }));
  return toNumericMoney({
    referenceCurrency: range.referenceCurrency,
    startDate: range.startDate,
    asOfDate: range.asOfDate,
    rows: [...rows, ...groupRows],
    total: aggregateAccountGainLoss(rows),
  });
}

export async function queryAccountGainLoss(args: {
  accountBookId: string;
  accountId: string;
  period?: string;
  includeDetails?: boolean;
}) {
  const range = await loadAccountGainLossRange({
    ...args,
    detailAccountId: args.includeDetails ? args.accountId : undefined,
  });
  const account = range.accounts.find((item) => item.id === args.accountId);
  if (!account) throw new Error("Holding account not found");
  return toNumericMoney({
    ...range.results.get(account.id)!,
    accountName: account.name,
    target: {
      accountId: account.id,
      accountName: account.name,
      isVirtual: false,
      unit: account.unit ?? "CURRENCY",
      unitLabel: formatUnitLabel({
        ...account,
        unit: account.unit ?? "CURRENCY",
      }),
      currency: account.currency,
      cryptocurrency: account.cryptocurrency,
      symbol: account.symbol,
      tradeCurrency: account.tradeCurrency,
    },
    referenceCurrency: range.referenceCurrency,
    startDate: range.startDate,
    asOfDate: range.asOfDate,
    realizedEvents: range.realizedEvents,
    unrealizedOpenLots: range.unrealizedOpenLots,
  });
}
