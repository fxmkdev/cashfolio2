import { type Money } from "../../../shared/money";
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
  items: Array<{
    accountId: string;
    accountName: string;
    groupId: string | null;
    accountType: AccountType;
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
      groupId: item.groupId,
      amount: classified.amount,
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
  };
}
