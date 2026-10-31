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
import {
  getGainLossInvestmentGroup,
  UNKNOWN_GAIN_LOSS_UNIT,
  type GainLossInvestmentGroup,
} from "./period-gain-loss-investment-group";

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

type AccountProjection = {
  node: PeriodGainsLossesBreakdownNode & {
    account: NonNullable<PeriodGainsLossesBreakdownNode["account"]>;
  };
  contributions: PeriodGainsLossesContribution[];
};

type GainLossStructure = {
  accounts?: Array<{ id: string; groupId: string | null }>;
  groupById?: Map<string, PeriodGroupNode>;
};

function totals(realizedGainLoss: Money, unrealizedGainLoss: Money) {
  return {
    realizedGainLoss: round2(realizedGainLoss),
    unrealizedGainLoss: round2(unrealizedGainLoss),
    totalGainLoss: round2(moneyAdd(realizedGainLoss, unrealizedGainLoss)),
  };
}

function contributionTotals(values: PeriodGainsLossesContribution[]) {
  return totals(
    moneySum(values.map((value) => value.realizedGainLoss)),
    moneySum(values.map((value) => value.unrealizedGainLoss)),
  );
}

function buildAccountMetadata(
  accountId: string,
  values: PeriodGainsLossesContribution[],
  attribution: GainLossAccountAttribution,
): AccountProjection["node"]["account"] {
  const first = values[0]!;
  const calculated = values.filter((value) => value.sourceKind === "HOLDING");
  const recorded = values.filter((value) => value.sourceKind === "EXPLICIT");
  return {
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
      [first.currency, first.cryptocurrency, first.symbol, first.tradeCurrency]
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
  };
}

function buildAccountProjections(
  contributions: PeriodGainsLossesContribution[],
  accountAttributionById?: ReadonlyMap<string, GainLossAccountAttribution>,
): AccountProjection[] {
  const byAccount = new Map<string, PeriodGainsLossesContribution[]>();
  for (const contribution of contributions) {
    if (
      toMoney(contribution.realizedGainLoss).isZero() &&
      toMoney(contribution.unrealizedGainLoss).isZero()
    )
      continue;
    byAccount
      .getOrInsertComputed(contribution.accountId, () => [])
      .push(contribution);
  }
  return Array.from(byAccount, ([accountId, values]) => {
    const attribution = accountAttributionById?.get(accountId) ?? {
      assetClass: null,
      kind: "unattributed" as const,
      explanation:
        "No single originating asset/liability account can be established; the amount remains Unclassified.",
    };
    return {
      contributions: values,
      node: {
        id: `gain-loss-account:${accountId}`,
        label: values[0]!.accountName,
        ...contributionTotals(values),
        account: buildAccountMetadata(accountId, values, attribution),
        children: [],
      },
    };
  });
}

function compareNodes(
  a: PeriodGainsLossesBreakdownNode,
  b: PeriodGainsLossesBreakdownNode,
): number {
  return a.label.localeCompare(b.label, "en") || a.id.localeCompare(b.id, "en");
}

function resolveInvestmentGroup(
  account: AccountProjection,
): GainLossInvestmentGroup {
  if (account.node.account.investmentGroup)
    return account.node.account.investmentGroup;
  // Legacy recorded accumulators can combine booking units without identifying
  // a financial account, so they cannot safely establish an investment unit.
  if (account.contributions.some((value) => value.sourceKind === "EXPLICIT"))
    return UNKNOWN_GAIN_LOSS_UNIT;
  const groups = new Map(
    account.contributions.map((value) => {
      const group = getGainLossInvestmentGroup(value);
      return [group.key, group] as const;
    }),
  );
  return groups.size === 1
    ? groups.values().next().value!
    : UNKNOWN_GAIN_LOSS_UNIT;
}

function buildInvestmentGroups(
  assetClass: string,
  accounts: AccountProjection[],
): PeriodGainsLossesBreakdownNode[] {
  const groups = new Map<
    string,
    { descriptor: GainLossInvestmentGroup; accounts: AccountProjection[] }
  >();
  for (const account of accounts) {
    const descriptor = resolveInvestmentGroup(account);
    groups
      .getOrInsertComputed(descriptor.key, () => ({ descriptor, accounts: [] }))
      .accounts.push(account);
  }
  return Array.from(groups.values(), ({ descriptor, accounts }) => ({
    id: `gain-loss-investment:${assetClass}:${descriptor.key}`,
    label: descriptor.label,
    ...contributionTotals(accounts.flatMap((account) => account.contributions)),
    children: accounts.map((account) => account.node).sort(compareNodes),
  })).sort(compareNodes);
}

function buildAssetClassHierarchy(
  accounts: AccountProjection[],
): PeriodGainsLossesBreakdownNode[] {
  const classes = [
    ...assetClassOptions,
    { value: "unclassified", label: "Unclassified" },
  ];
  return classes.flatMap((descriptor) => {
    const matching = accounts.filter(
      ({ node }) =>
        (node.account.assetClass ?? "unclassified") === descriptor.value,
    );
    if (!matching.length) return [];
    return [
      {
        id: `asset-class:${descriptor.value}`,
        label: descriptor.label,
        ...contributionTotals(
          matching.flatMap((account) => account.contributions),
        ),
        children: buildInvestmentGroups(descriptor.value, matching),
      },
    ];
  });
}

type StructureAccumulator = {
  roots: PeriodGainsLossesBreakdownNode[];
  groups: Map<
    string,
    {
      node: PeriodGainsLossesBreakdownNode;
      contributions: PeriodGainsLossesContribution[];
    }
  >;
};

function appendStructureAccount(
  account: AccountProjection,
  path: PeriodGroupNode[],
  state: StructureAccumulator,
) {
  let children = state.roots;
  for (const group of path) {
    const entry = state.groups.getOrInsertComputed(group.id, () => {
      const node = {
        id: `group:${group.id}`,
        label: group.name,
        ...totals(toMoney(0), toMoney(0)),
        children: [],
      };
      children.push(node);
      return { node, contributions: [] };
    });
    entry.contributions.push(...account.contributions);
    children = entry.node.children;
  }
  children.push({ ...account.node, id: `account:${account.node.account.id}` });
}

function sortStructure(nodes: PeriodGainsLossesBreakdownNode[]) {
  nodes.sort(compareNodes);
  for (const node of nodes) sortStructure(node.children);
}

function buildAccountStructureHierarchy(
  projections: AccountProjection[],
  structure: GainLossStructure,
): PeriodGainsLossesBreakdownNode[] {
  const accounts = new Map(
    structure.accounts?.map((account) => [account.id, account]),
  );
  const groups = new Map(structure.groupById);
  const unattributedGroup = {
    id: UNATTRIBUTED_GROUP_ID,
    name: "Unattributed",
    parentGroupId: null,
  };
  const state: StructureAccumulator = { roots: [], groups: new Map() };
  for (const projection of projections) {
    const account = accounts.get(projection.node.account.id);
    const path =
      !account || (account.groupId && !groups.has(account.groupId))
        ? [unattributedGroup]
        : account.groupId
          ? resolveGroupPathToRoot({
              groupId: account.groupId,
              groupById: groups,
            }).reverse()
          : [];
    appendStructureAccount(projection, path, state);
  }
  // Sum original contributions, never the rounded child values.
  for (const { node, contributions } of state.groups.values()) {
    Object.assign(node, contributionTotals(contributions));
  }
  sortStructure(state.roots);
  return state.roots;
}

export function buildGainsLossesBreakdown(
  args: GainLossStructure & {
    contributions: PeriodGainsLossesContribution[];
    referenceCurrency: string;
    accountAttributionById?: ReadonlyMap<string, GainLossAccountAttribution>;
    grouping?: ReportingGrouping;
  },
) {
  const accounts = buildAccountProjections(
    args.contributions,
    args.accountAttributionById,
  );
  const hierarchy =
    args.grouping === "accountStructure"
      ? buildAccountStructureHierarchy(accounts, args)
      : buildAssetClassHierarchy(accounts);
  return { hierarchy, ...contributionTotals(args.contributions) };
}
