import { AccountType } from "../../.prisma-client/enums";
import { createGroupPathResolver } from "../accounts/accounts-helpers";
import {
  round2,
  type BreakdownHierarchyAccumulatorItem,
} from "./period-helpers";
import {
  moneyAdd,
  moneyRound2,
  moneySum,
  toMoneyNumber,
} from "../../shared/money";
import {
  parseTimelineScopeSelection,
  type TimelineScopeOption,
  type TimelineScopeSelection,
  type TimelineScopedMetric,
} from "../../shared/timeline-scope";
import type { PeriodGainsLossesBreakdownNode } from "./period-gains-losses-breakdown";

export type TimelineMetricScopeFilter = {
  metric: TimelineScopedMetric;
  scope: TimelineScopeSelection;
};

export function buildBalanceTimelineScopeAmountMaps(args: {
  accounts: Array<{
    id: string;
    name: string;
    groupId: string | null;
    type: AccountType;
  }>;
  convertedBalanceByAccountId: Map<string, number | null>;
}) {
  const assetAmountByAccountId = new Map<
    string,
    BreakdownHierarchyAccumulatorItem
  >();
  const liabilityAmountByAccountId = new Map<
    string,
    BreakdownHierarchyAccumulatorItem
  >();

  for (const account of args.accounts) {
    const convertedBalance = args.convertedBalanceByAccountId.get(account.id);
    if (convertedBalance == null) {
      continue;
    }

    if (account.type === AccountType.ASSET) {
      assetAmountByAccountId.set(account.id, {
        accountId: account.id,
        accountName: account.name,
        groupId: account.groupId,
        amount: convertedBalance,
      });
      continue;
    }

    if (account.type === AccountType.LIABILITY) {
      liabilityAmountByAccountId.set(account.id, {
        accountId: account.id,
        accountName: account.name,
        groupId: account.groupId,
        amount: -convertedBalance,
      });
    }
  }

  return {
    assetAmountByAccountId,
    liabilityAmountByAccountId,
  };
}

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
  amountByAccountId: Map<string, BreakdownHierarchyAccumulatorItem>;
  scope: TimelineScopeSelection;
  groupById: Map<string, { parentGroupId: string | null }>;
}): number {
  if (args.scope === "total") {
    return toMoneyNumber(
      moneyRound2(
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

  return toMoneyNumber(moneyRound2(amount));
}

function findGainLossNodeByScope(args: {
  hierarchy: PeriodGainsLossesBreakdownNode[];
  scope: TimelineScopeSelection;
}): PeriodGainsLossesBreakdownNode | undefined {
  const nodes = [...args.hierarchy];
  while (nodes.length > 0) {
    const node = nodes.shift();
    if (!node) {
      continue;
    }

    if (node.id === args.scope) {
      return node;
    }

    nodes.push(...node.children);
  }

  return undefined;
}

function resolveScopedGainLossValue(args: {
  hierarchy: PeriodGainsLossesBreakdownNode[];
  scope: TimelineScopeSelection;
}): number {
  if (args.scope === "total") {
    return toMoneyNumber(
      moneyRound2(moneySum(args.hierarchy.map((node) => node.totalGainLoss))),
    );
  }

  return round2(
    findGainLossNodeByScope({
      hierarchy: args.hierarchy,
      scope: args.scope,
    })?.totalGainLoss ?? 0,
  );
}

export function resolveScopedMetricValue(args: {
  metricScopeFilter?: TimelineMetricScopeFilter;
  amountByMetric: Partial<
    Record<TimelineScopedMetric, Map<string, BreakdownHierarchyAccumulatorItem>>
  >;
  gainsLossesHierarchy?: PeriodGainsLossesBreakdownNode[];
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

  if (args.metricScopeFilter.metric === "gainsLosses") {
    return resolveScopedGainLossValue({
      hierarchy: args.gainsLossesHierarchy ?? [],
      scope: parsedScope,
    });
  }

  const amountByAccountId = args.amountByMetric[args.metricScopeFilter.metric];
  if (!amountByAccountId) {
    return undefined;
  }

  const groupById = new Map(
    args.allAccountGroups.map((group) => [
      group.id,
      { parentGroupId: group.parentGroupId },
    ]),
  );
  return resolveScopedAmountFromMap({
    amountByAccountId,
    scope: parsedScope,
    groupById,
  });
}

export function buildTimelineGainLossScopeOptions(args: {
  hierarchy: PeriodGainsLossesBreakdownNode[];
}): TimelineScopeOption[] {
  const options: TimelineScopeOption[] = [];

  const appendNodes = (
    nodes: PeriodGainsLossesBreakdownNode[],
    parentValue: TimelineScopeSelection | undefined,
    parentLabel: string | undefined,
  ) => {
    for (const node of nodes) {
      const value = node.id as TimelineScopeSelection;
      const label = parentLabel ? `${parentLabel} / ${node.label}` : node.label;
      options.push({
        value,
        label,
        kind: "gainLoss",
        treeLabel: node.label,
        ...(parentValue ? { parentValue } : {}),
      });
      appendNodes(node.children, value, label);
    }
  };

  appendNodes(args.hierarchy, undefined, undefined);
  return options;
}

export function buildTimelineScopeOptions(args: {
  amountByAccountId: Map<string, BreakdownHierarchyAccumulatorItem>;
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
        name: group.name,
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
      treeLabel: item.accountName,
      ...(item.groupId
        ? { parentValue: `group:${item.groupId}` as const }
        : {}),
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
      const group = groupById.get(groupId);
      groupOptionByValue.set(groupValue, {
        value: groupValue,
        label: resolveGroupPath(groupId),
        kind: "group",
        treeLabel: group?.name ?? resolveGroupPath(groupId),
        ...(group?.parentGroupId
          ? { parentValue: `group:${group.parentGroupId}` as const }
          : {}),
      });
      groupId = group?.parentGroupId ?? null;
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
