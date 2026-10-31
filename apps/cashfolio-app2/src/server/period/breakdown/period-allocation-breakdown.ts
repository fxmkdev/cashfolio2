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
} from "./period-breakdown-state";
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

    breakdownItems.push({
      accountId: item.accountId,
      accountName: item.accountName,
      groupId:
        args.grouping === "assetClass"
          ? (item.assetClassId ?? "unclassified")
          : item.groupId,
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
      args.grouping === "assetClass" ? assetClassGroups : args.groupById,
  });
  if (args.grouping === "assetClass") {
    const classes = [
      ...classificationOptions(args.assetClasses ?? defaultAssetClassNodes).map(
        (node) => node.value,
      ),
      "unclassified",
    ];
    const updateNodes = (nodes: typeof hierarchy) => {
      nodes.sort(
        (a, b) =>
          (a.kind === "group"
            ? classes.indexOf(a.id.slice(6))
            : Number.MAX_SAFE_INTEGER) -
          (b.kind === "group"
            ? classes.indexOf(b.id.slice(6))
            : Number.MAX_SAFE_INTEGER),
      );
      for (const node of nodes) {
        if (node.kind === "group")
          node.id = node.id.replace(/^group:/, "asset-class:");
        updateNodes(node.children);
      }
    };
    updateNodes(hierarchy);
    for (let i = 0; i < hiddenAmountDiscrepancyNodeIds.length; i++)
      hiddenAmountDiscrepancyNodeIds[i] = hiddenAmountDiscrepancyNodeIds[
        i
      ]!.replace(/^group:/, "asset-class:");
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
