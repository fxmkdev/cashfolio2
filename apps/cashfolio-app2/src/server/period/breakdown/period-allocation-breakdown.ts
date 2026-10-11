import { type Money, toMoney, moneyIsZero } from "../../../shared/money";
import {
  type PeriodGroupNode,
  type BreakdownHierarchyAccumulatorItem,
} from "./period-breakdown-state";
import { type BreakdownHierarchyNode } from "../../../shared/breakdown-hierarchy";
import { AccountType } from "../../../.prisma-client/enums";
import { buildBreakdownHierarchyWithMeta } from "./period-breakdown-hierarchy";
import { buildBreakdownItems } from "./period-breakdown-buckets";

export function buildPeriodEndAllocationBreakdown(args: {
  items: Array<{
    accountId: string;
    accountName: string;
    groupId: string | null;
    accountType: "ASSET" | "LIABILITY";
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
  skippedNegativeCount: number;
} {
  const breakdownItems: BreakdownHierarchyAccumulatorItem[] = [];
  let skippedMissingReferenceBalanceCount = 0;
  let skippedNegativeCount = 0;

  for (const item of args.items) {
    if (item.convertedBalanceInReferenceCurrency == null) {
      skippedMissingReferenceBalanceCount += 1;
      continue;
    }

    const displayAmount =
      item.accountType === AccountType.ASSET
        ? item.convertedBalanceInReferenceCurrency
        : toMoney(item.convertedBalanceInReferenceCurrency).neg();

    if (toMoney(displayAmount).comparedTo(0) < 0) {
      skippedNegativeCount += 1;
      continue;
    }
    if (moneyIsZero(displayAmount)) {
      continue;
    }

    breakdownItems.push({
      accountId: item.accountId,
      accountName: item.accountName,
      groupId: item.groupId,
      amount: displayAmount,
    });
  }

  const {
    hierarchy,
    hasHiddenAmountDiscrepancy,
    hiddenAmountDiscrepancyNodeIds,
  } = buildBreakdownHierarchyWithMeta({
    items: breakdownItems,
    groupById: args.groupById,
  });
  const topLevelBreakdown = buildBreakdownItems(
    hierarchy.map((node) => ({
      id: node.id,
      label: node.label,
      kind: node.kind,
      amount: node.amount,
    })),
  );

  return {
    totalAmount: topLevelBreakdown.totalAmount,
    items: topLevelBreakdown.items,
    hierarchy,
    hasHiddenAmountDiscrepancy,
    hiddenAmountDiscrepancyNodeIds,
    skippedMissingReferenceBalanceCount,
    skippedNegativeCount,
  };
}
