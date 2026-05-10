import { createGroupPathResolver } from "./accounts-helpers";
import { round2 } from "./period-helpers";
import { moneyAdd, moneySum, toMoneyNumber } from "../shared/money";
import {
  parseTimelineScopeSelection,
  type TimelineScopeOption,
  type TimelineScopeSelection,
  type TimelineScopedMetric,
} from "../shared/timeline-scope";

type TimelineScopedAmountEntry = {
  accountId: string;
  accountName: string;
  groupId: string | null;
  amount: number;
};

export type TimelineMetricScopeFilter = {
  metric: TimelineScopedMetric;
  scope: TimelineScopeSelection;
};

function hasGroupInPath(args: {
  accountGroupId: string | null;
  targetGroupId: string;
  groupById: Map<string, { parentGroupId: string | null }>;
}): boolean {
  let groupId = args.accountGroupId;
  const visitedGroupIds = new Set<string>();
  while (groupId) {
    if (groupId === args.targetGroupId) {
      return true;
    }
    if (visitedGroupIds.has(groupId)) {
      return false;
    }
    visitedGroupIds.add(groupId);
    groupId = args.groupById.get(groupId)?.parentGroupId ?? null;
  }

  return false;
}

function resolveScopedAmountFromMap(args: {
  amountByAccountId: Map<string, TimelineScopedAmountEntry>;
  scope: TimelineScopeSelection;
  groupById: Map<string, { parentGroupId: string | null }>;
}): number {
  if (args.scope === "total") {
    return round2(
      toMoneyNumber(
        moneySum(
          Array.from(args.amountByAccountId.values(), (item) => item.amount),
        ),
      ),
    );
  }

  if (args.scope.startsWith("account:")) {
    const accountId = args.scope.slice("account:".length);
    return round2(args.amountByAccountId.get(accountId)?.amount ?? 0);
  }

  const groupId = args.scope.slice("group:".length);
  let amount = moneySum([]);
  for (const item of args.amountByAccountId.values()) {
    if (
      hasGroupInPath({
        accountGroupId: item.groupId,
        targetGroupId: groupId,
        groupById: args.groupById,
      })
    ) {
      amount = moneyAdd(amount, item.amount);
    }
  }

  return round2(toMoneyNumber(amount));
}

export function resolveScopedMetricValue(args: {
  metricScopeFilter?: TimelineMetricScopeFilter;
  incomeAmountByAccountId: Map<string, TimelineScopedAmountEntry>;
  expenseAmountByAccountId: Map<string, TimelineScopedAmountEntry>;
  allAccountGroups: Array<{
    id: string;
    name: string;
    parentGroupId: string | null;
  }>;
}): number | undefined {
  if (!args.metricScopeFilter) {
    return undefined;
  }

  const parsedScope = parseTimelineScopeSelection(args.metricScopeFilter.scope);
  if (!parsedScope) {
    return undefined;
  }

  const groupById = new Map(
    args.allAccountGroups.map((group) => [
      group.id,
      { parentGroupId: group.parentGroupId },
    ]),
  );
  if (args.metricScopeFilter.metric === "income") {
    return resolveScopedAmountFromMap({
      amountByAccountId: args.incomeAmountByAccountId,
      scope: parsedScope,
      groupById,
    });
  }

  return resolveScopedAmountFromMap({
    amountByAccountId: args.expenseAmountByAccountId,
    scope: parsedScope,
    groupById,
  });
}

export function buildTimelineScopeOptions(args: {
  amountByAccountId: Map<string, TimelineScopedAmountEntry>;
  allAccountGroups: Array<{
    id: string;
    name: string;
    parentGroupId: string | null;
  }>;
}): TimelineScopeOption[] {
  const nonZeroItems = Array.from(args.amountByAccountId.values()).filter(
    (item) => item.amount !== 0,
  );
  if (nonZeroItems.length === 0) {
    return [];
  }

  const resolveGroupPath = createGroupPathResolver(args.allAccountGroups);
  const groupById = new Map(
    args.allAccountGroups.map((group) => [
      group.id,
      {
        parentGroupId: group.parentGroupId,
      },
    ]),
  );
  const accountOptionByValue = new Map<
    TimelineScopeSelection,
    TimelineScopeOption
  >();
  const groupOptionByValue = new Map<
    TimelineScopeSelection,
    TimelineScopeOption
  >();

  for (const item of nonZeroItems) {
    const accountValue = `account:${item.accountId}` as const;
    const accountLabel = item.groupId
      ? `${resolveGroupPath(item.groupId)} / ${item.accountName}`
      : item.accountName;
    accountOptionByValue.set(accountValue, {
      value: accountValue,
      label: accountLabel,
      kind: "account",
    });

    if (!item.groupId) {
      continue;
    }

    let groupId: string | null = item.groupId;
    const visitedGroupIds = new Set<string>();
    while (groupId) {
      if (visitedGroupIds.has(groupId)) {
        break;
      }
      visitedGroupIds.add(groupId);
      const groupValue = `group:${groupId}` as const;
      groupOptionByValue.set(groupValue, {
        value: groupValue,
        label: resolveGroupPath(groupId),
        kind: "group",
      });
      groupId = groupById.get(groupId)?.parentGroupId ?? null;
    }
  }

  return [
    ...groupOptionByValue.values(),
    ...accountOptionByValue.values(),
  ].toSorted(
    (left, right) =>
      left.label.localeCompare(right.label, "en") ||
      left.value.localeCompare(right.value, "en"),
  );
}
