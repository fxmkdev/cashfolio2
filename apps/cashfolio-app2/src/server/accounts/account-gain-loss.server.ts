import { formatUnitLabel } from "../period/period-unit-format";
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
import { getOrLoadAccountGainLossSummaries } from "./account-gain-loss-cache.server";

export { resolveAccountGainLossDate } from "./account-gain-loss-range.server";

export async function queryAccountGainLossSummaries(args: {
  accountBookId: string;
  type: "ASSET" | "LIABILITY";
  accountState: "active" | "inactive";
}) {
  const range = await getOrLoadAccountGainLossSummaries(args.accountBookId);
  const groups = range.groups.filter((group) => group.type === args.type);
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const selectedAccounts = range.accounts.filter(
    (account) =>
      account.type === args.type &&
      account.isActive === (args.accountState === "active"),
  );
  const descendants = new Map<string, AccountGainLossResult<Money>[]>();
  const rows = selectedAccounts.map((account) => {
    const result = account.result;
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
    realizedEvents: range.realizedEvents,
    unrealizedOpenLots: range.unrealizedOpenLots,
  });
}
