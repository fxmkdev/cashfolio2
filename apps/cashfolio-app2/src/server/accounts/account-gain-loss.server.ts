import { formatUnitLabel } from "../period/period-unit-format";
import { projectArchivedAccountHierarchy } from "../../shared/archived-account-hierarchy";
import type { Money } from "../../shared/money";
import {
  aggregateAccountGainLoss,
  type AccountGainLossResult,
} from "../../shared/account-gain-loss";
import { toNumericMoney } from "../money-boundary";
import {
  loadAccountGainLossRange,
  resolveAccountGainLossDate,
} from "./account-gain-loss-range.server";
import { loadAccountGainLossSummaryRange } from "./account-gain-loss-basis-cache.server";
import { getOrLoadAccountGainLossSummaries } from "./account-gain-loss-cache.server";
import { prisma } from "../../prisma.server";
import { addUtcDays, startOfUtcDay } from "../../shared/date";
import { loadRecordedAccountGainLossInputs } from "./account-recorded-gain-loss.server";

/** Cheap eligibility check for reference-currency ledgers; no valuations or FIFO replay. */
export async function queryAccountRecordedGainLossEligibility(args: {
  accountBookId: string;
  accountId: string;
  period?: string;
}) {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      const book = await tx.accountBook.findUniqueOrThrow({
        where: { id: args.accountBookId },
        select: { startDate: true },
      });
      const inputs = await loadRecordedAccountGainLossInputs(
        {
          accountBookId: args.accountBookId,
          counterpartAccountId: args.accountId,
          queryStart: startOfUtcDay(book.startDate),
          queryEndExclusive: addUtcDays(
            resolveAccountGainLossDate(args.period),
            1,
          ),
        },
        tx,
      );
      return [...inputs.counterparts.values()].some(
        (account) => account.id === args.accountId,
      );
    },
    { isolationLevel: "RepeatableRead", timeout: 30_000 },
  );
}

export { resolveAccountGainLossDate } from "./account-gain-loss-range.server";

export async function queryAccountGainLossSummaries(args: {
  accountBookId: string;
  type: "BALANCE";
  accountState: "active" | "inactive" | "all";
}) {
  const range = await getOrLoadAccountGainLossSummaries(args.accountBookId);
  const groups = range.groups.filter((group) => group.type === args.type);
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const selectedAccounts = range.accounts.filter(
    (account) =>
      account.type === args.type &&
      (args.accountState === "all" ||
        account.isActive === (args.accountState === "active")),
  );
  const projection =
    args.accountState === "all"
      ? projectArchivedAccountHierarchy([
          ...groups.map((group) => ({
            ...group,
            nodeType: "accountGroup" as const,
            parentId: group.parentGroupId ?? undefined,
          })),
          ...selectedAccounts.map((account) => ({
            ...account,
            nodeType: "account" as const,
            parentId: account.groupId ?? undefined,
          })),
        ])
      : undefined;
  const descendants = new Map<string, AccountGainLossResult<Money>[]>();
  const rows = selectedAccounts.map((account) => {
    const result = account.result;
    let groupId = projection
      ? projection.parentIdById.get(account.id)
      : account.groupId;
    const visited = new Set<string>();
    while (groupId && !visited.has(groupId)) {
      visited.add(groupId);
      descendants.getOrInsertComputed(groupId, () => []).push(result);
      groupId = projection
        ? projection.parentIdById.get(groupId)
        : (groupById.get(groupId)?.parentGroupId ?? null);
    }
    return { id: account.id, ...result };
  });
  const groupRows = [...groups, ...(projection?.archivedGroups ?? [])].map(
    (group) => ({
      id: group.id,
      ...aggregateAccountGainLoss(descendants.get(group.id) ?? []),
    }),
  );
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
  const range = await (
    args.includeDetails
      ? loadAccountGainLossRange
      : loadAccountGainLossSummaryRange
  )({
    ...args,
    asOfDate: resolveAccountGainLossDate(args.period),
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
    recordedAdjustments: range.recordedAdjustments,
    realizedEvents: range.realizedEvents,
    unrealizedOpenLots: range.unrealizedOpenLots,
  });
}
