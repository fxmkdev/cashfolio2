import {
  type Money,
  moneySum,
  moneyRound2,
  toMoney,
} from "../../../shared/money";
import {
  classificationOptions,
  defaultAssetClassNodes,
  type ClassificationNode,
} from "../../../shared/asset-class";
import type { ReportingGrouping } from "../../../shared/reporting-grouping";
import { buildAssetClassGroups } from "./period-reporting-groups";
import {
  type PeriodGroupNode,
  type BreakdownHierarchyAccumulatorItem,
  resolveGroupPathToRoot,
} from "./period-breakdown-state";
import {
  UNKNOWN_GAIN_LOSS_UNIT,
  type GainLossInvestmentGroup,
} from "./period-gain-loss-investment-group";
import { type BreakdownHierarchyNode } from "../../../shared/breakdown-hierarchy";
import { type AccountType } from "../../../.prisma-client/enums";
import { buildBreakdownHierarchyWithMeta } from "./period-breakdown-hierarchy";
import { buildBreakdownItems } from "./period-breakdown-buckets";

import { isBalanceAccount } from "../../../shared/account-presentation";
import {
  classifyBalanceAccount,
  type BalanceSide,
} from "../balance-classification";

export function buildPeriodEndAllocationBreakdown(args: {
  side: BalanceSide;
  grouping?: ReportingGrouping;
  assetClasses?: readonly ClassificationNode[];
  items: Array<{
    accountId: string;
    accountName: string;
    groupId: string | null;
    accountType: AccountType;
    assetClassId?: string | null;
    investmentGroup?: GainLossInvestmentGroup;
    convertedBalanceInReferenceCurrency: Money | null;
  }>;
  groupById: Map<string, PeriodGroupNode>;
}): {
  totalAmount: Money;
  items: Array<{
    id: string;
    label: string;
    kind: "group" | "account";
    amount: Money;
    percentage: Money;
  }>;
  hierarchy: BreakdownHierarchyNode<Money>[];
  hasHiddenAmountDiscrepancy: boolean;
  hiddenAmountDiscrepancyNodeIds: string[];
  skippedMissingReferenceBalanceCount: number;
} {
  const breakdownItems: BreakdownHierarchyAccumulatorItem[] = [];
  const assetClassGroups = buildAssetClassGroups(args.assetClasses);
  const allocationGroups = new Map(assetClassGroups);
  const accountGroupPaths = new Map<string, string[]>();
  let skippedMissingReferenceBalanceCount = 0;

  for (const item of args.items) {
    if (!isBalanceAccount({ type: item.accountType })) continue;
    if (item.convertedBalanceInReferenceCurrency == null) {
      skippedMissingReferenceBalanceCount += 1;
      continue;
    }

    const classified = classifyBalanceAccount(
      item.accountType,
      item.convertedBalanceInReferenceCurrency,
    );
    if (classified?.side !== args.side) continue;

    let groupId = item.groupId;
    if (args.grouping === "assetClass") {
      const classId =
        item.assetClassId && assetClassGroups.has(item.assetClassId)
          ? item.assetClassId
          : "unclassified";
      const investment = item.investmentGroup ?? UNKNOWN_GAIN_LOSS_UNIT;
      groupId = `allocation-investment:${classId}:${investment.key}`;
      allocationGroups.set(groupId, {
        id: groupId,
        name: investment.label,
        parentGroupId: classId,
      });
      if (!item.accountId.startsWith("virtual:")) {
        accountGroupPaths.set(
          `account:${item.accountId}`,
          item.groupId
            ? resolveGroupPathToRoot({
                groupId: item.groupId,
                groupById: args.groupById,
              })
                .reverse()
                .map((group) => group.name)
            : [],
        );
      }
    }

    breakdownItems.push({
      accountId: item.accountId,
      accountName: item.accountName,
      groupId,
      amount: classified.amount,
    });
  }

  const {
    hierarchy,
    hasHiddenAmountDiscrepancy,
    hiddenAmountDiscrepancyNodeIds,
  } = buildBreakdownHierarchyWithMeta({
    items: breakdownItems,
    groupById:
      args.grouping === "assetClass" ? allocationGroups : args.groupById,
  });
  if (args.grouping === "assetClass") {
    const classes = [
      ...classificationOptions(args.assetClasses ?? defaultAssetClassNodes).map(
        (node) => node.value,
      ),
      "unclassified",
    ];
    const classOrder = new Map(
      classes.map((id, index) => [`group:${id}`, index]),
    );
    const reportNodeId = (id: string) =>
      id.startsWith("group:allocation-investment:")
        ? id.slice(6)
        : id.replace(/^group:/, "asset-class:");
    const updateNodes = (nodes: typeof hierarchy) => {
      nodes.sort(
        (a, b) =>
          (classOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
          (classOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER),
      );
      for (const node of nodes) {
        if (node.kind === "group") node.id = reportNodeId(node.id);
        const accountGroupPath = accountGroupPaths.get(node.id);
        if (accountGroupPath) node.accountGroupPath = accountGroupPath;
        updateNodes(node.children);
      }
    };
    updateNodes(hierarchy);
    for (let i = 0; i < hiddenAmountDiscrepancyNodeIds.length; i++)
      hiddenAmountDiscrepancyNodeIds[i] = reportNodeId(
        hiddenAmountDiscrepancyNodeIds[i]!,
      );
  }
  const topLevelBreakdown = buildBreakdownItems(
    hierarchy.map((node) => ({
      id: node.id,
      label: node.label,
      kind: node.kind,
      amount: node.amount,
    })),
  );
  const totalAmount = moneyRound2(
    moneySum(breakdownItems.map((item) => item.amount)),
  );

  return {
    totalAmount,
    items:
      args.grouping === "assetClass"
        ? hierarchy.map((node) =>
            topLevelBreakdown.items.find((item) => item.id === node.id)!,
          )
        : topLevelBreakdown.items,
    hierarchy,
    hasHiddenAmountDiscrepancy:
      hasHiddenAmountDiscrepancy ||
      !toMoney(topLevelBreakdown.totalAmount).equals(totalAmount),
    hiddenAmountDiscrepancyNodeIds,
    skippedMissingReferenceBalanceCount,
  };
}
