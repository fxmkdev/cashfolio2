import { getLegacyHoldingGainLossScope } from "../../../shared/history-scope";
import { toMoney, type Money, moneyAdd, moneySum } from "../../../shared/money";
import type { Unit } from "../../../.prisma-client/enums";

import { round2 } from "../period-helpers";
import { assetClassOptions } from "../../../shared/asset-class";
import type { GainLossAccountAttribution } from "./period-gain-loss-attribution";
import type { ReportingGrouping } from "../../../shared/reporting-grouping";
import {
  resolveGroupPathToRoot,
  type PeriodGroupNode,
} from "./period-breakdown-state";
import { UNATTRIBUTED_GROUP_ID } from "./period-reporting-groups";

export type PeriodGainsLossesContribution = {
  sourceKind: "HOLDING" | "EXPLICIT";
  accountId: string;
  accountName: string;
  originatingAccountIds?: string[];
  unit: Unit;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
  realizedGainLoss: Money;
  unrealizedGainLoss: Money;
};

export type PeriodGainsLossesBreakdownNode = {
  id: string;
  label: string;
  realizedGainLoss: Money;
  unrealizedGainLoss: Money;
  totalGainLoss: Money;
  children: PeriodGainsLossesBreakdownNode[];
  account?: GainLossAccountAttribution & {
    id: string;
    legacyScopes: string[];
    sources: Array<PeriodGainsLossesContribution["sourceKind"]>;
    instrumentLabel: string;
    calculatedRealizedGainLoss: Money;
    calculatedUnrealizedGainLoss: Money;
    recordedGainLoss: Money;
  };
};

function totals(realizedGainLoss: Money, unrealizedGainLoss: Money) {
  return {
    realizedGainLoss: round2(realizedGainLoss),
    unrealizedGainLoss: round2(unrealizedGainLoss),
    totalGainLoss: round2(moneyAdd(realizedGainLoss, unrealizedGainLoss)),
  };
}

export function buildGainsLossesBreakdown(args: {
  contributions: PeriodGainsLossesContribution[];
  referenceCurrency: string;
  accountAttributionById?: ReadonlyMap<string, GainLossAccountAttribution>;
  grouping?: ReportingGrouping;
  accounts?: Array<{ id: string; groupId: string | null }>;
  groupById?: Map<string, PeriodGroupNode>;
}) {
  const byAccount = new Map<string, PeriodGainsLossesContribution[]>();
  for (const contribution of args.contributions) {
    if (
      toMoney(contribution.realizedGainLoss).isZero() &&
      toMoney(contribution.unrealizedGainLoss).isZero()
    )
      continue;
    byAccount
      .getOrInsertComputed(contribution.accountId, () => [])
      .push(contribution);
  }
  const classes = [
    ...assetClassOptions,
    { value: "unclassified", label: "Unclassified" },
  ];
  const hierarchy: PeriodGainsLossesBreakdownNode[] = [];
  for (const descriptor of classes) {
    const contributions: PeriodGainsLossesContribution[] = [];
    const children: PeriodGainsLossesBreakdownNode[] = [];
    for (const [accountId, values] of byAccount) {
      const attribution = args.accountAttributionById?.get(accountId) ?? {
        assetClass: null,
        kind: "unattributed" as const,
        explanation:
          "No single originating asset/liability account can be established; the amount remains Unclassified.",
      };
      if ((attribution.assetClass ?? "unclassified") !== descriptor.value)
        continue;
      contributions.push(...values);
      const first = values[0]!;
      const calculated = values.filter(
        (value) => value.sourceKind === "HOLDING",
      );
      const recorded = values.filter(
        (value) => value.sourceKind === "EXPLICIT",
      );
      children.push({
        id: `gain-loss-account:${accountId}`,
        label: first.accountName,
        ...totals(
          moneySum(values.map((value) => value.realizedGainLoss)),
          moneySum(values.map((value) => value.unrealizedGainLoss)),
        ),
        account: {
          ...attribution,
          id: accountId,
          legacyScopes: values.map((value) =>
            value.sourceKind === "EXPLICIT"
              ? `explicit-account:${accountId}`
              : getLegacyHoldingGainLossScope({ ...value, id: accountId }),
          ),
          sources: [...new Set(values.map((value) => value.sourceKind))],
          instrumentLabel:
            attribution.instrumentLabel ??
            [
              first.currency,
              first.cryptocurrency,
              first.symbol,
              first.tradeCurrency,
            ]
              .filter(Boolean)
              .join(" / "),
          calculatedRealizedGainLoss: round2(
            moneySum(calculated.map((value) => value.realizedGainLoss)),
          ),
          calculatedUnrealizedGainLoss: round2(
            moneySum(calculated.map((value) => value.unrealizedGainLoss)),
          ),
          recordedGainLoss: round2(
            moneySum(recorded.map((value) => value.realizedGainLoss)),
          ),
        },
        children: [],
      });
    }
    if (!children.length) continue;
    hierarchy.push({
      id: `asset-class:${descriptor.value}`,
      label: descriptor.label,
      ...totals(
        moneySum(contributions.map((value) => value.realizedGainLoss)),
        moneySum(contributions.map((value) => value.unrealizedGainLoss)),
      ),
      children: children.sort(
        (a, b) =>
          a.label.localeCompare(b.label, "en") ||
          a.id.localeCompare(b.id, "en"),
      ),
    });
  }
  const total = totals(
    moneySum(args.contributions.map((value) => value.realizedGainLoss)),
    moneySum(args.contributions.map((value) => value.unrealizedGainLoss)),
  );
  if (args.grouping !== "accountStructure") return { hierarchy, ...total };

  const accounts = new Map(
    args.accounts?.map((account) => [account.id, account]),
  );
  const groups = new Map(args.groupById);
  groups.set(UNATTRIBUTED_GROUP_ID, {
    id: UNATTRIBUTED_GROUP_ID,
    name: "Unattributed",
    parentGroupId: null,
  });
  const roots: PeriodGainsLossesBreakdownNode[] = [];
  const groupNodes = new Map<string, PeriodGainsLossesBreakdownNode>();
  // Group totals use the original contributions, never rounded child values.
  const rawByGroup = new Map<string, PeriodGainsLossesContribution[]>();
  for (const leaf of hierarchy.flatMap((node) => node.children)) {
    const accountId = leaf.account!.id;
    const account = accounts.get(accountId);
    const path =
      account && (!account.groupId || groups.has(account.groupId))
        ? account.groupId
          ? resolveGroupPathToRoot({
              groupId: account.groupId,
              groupById: groups,
            }).reverse()
          : []
        : [groups.get(UNATTRIBUTED_GROUP_ID)!];
    let children = roots;
    for (const group of path) {
      let node = groupNodes.get(group.id);
      if (!node) {
        node = {
          id: `group:${group.id}`,
          label: group.name,
          ...totals(toMoney(0), toMoney(0)),
          children: [],
        };
        groupNodes.set(group.id, node);
        children.push(node);
      }
      rawByGroup
        .getOrInsertComputed(group.id, () => [])
        .push(...byAccount.get(accountId)!);
      children = node.children;
    }
    children.push({ ...leaf, id: `account:${accountId}` });
  }
  for (const [id, node] of groupNodes) {
    const values = rawByGroup.get(id)!;
    Object.assign(
      node,
      totals(
        moneySum(values.map((value) => value.realizedGainLoss)),
        moneySum(values.map((value) => value.unrealizedGainLoss)),
      ),
    );
  }
  const sort = (nodes: PeriodGainsLossesBreakdownNode[]) => {
    nodes.sort(
      (a, b) =>
        a.label.localeCompare(b.label, "en") || a.id.localeCompare(b.id, "en"),
    );
    for (const node of nodes) sort(node.children);
  };
  sort(roots);
  return { hierarchy: roots, ...total };
}
