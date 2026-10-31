import {
  type Money,
  moneySum,
  moneyRound2,
  toMoney,
} from "../../../shared/money";
import type { ClassificationNode } from "../../../shared/asset-class";
import type { ReportingGrouping } from "../../../shared/reporting-grouping";
import type { PeriodGroupNode } from "./period-breakdown-state";
import { type BreakdownHierarchyNode } from "../../../shared/breakdown-hierarchy";
import { type AccountType } from "../../../.prisma-client/enums";
import { buildBreakdownItems } from "./period-breakdown-buckets";
import {
  buildAllocationHierarchy,
  type AllocationHierarchyItem,
} from "./period-allocation-hierarchy";
import { isBalanceAccount } from "../../../shared/account-presentation";
import {
  classifyBalanceAccount,
  type BalanceSide,
} from "../balance-classification";

type AllocationBreakdownArgs = {
  side: BalanceSide;
  grouping?: ReportingGrouping;
  assetClasses?: readonly ClassificationNode[];
  items: Array<
    Omit<AllocationHierarchyItem, "amount"> & {
      accountType: AccountType;
      convertedBalanceInReferenceCurrency: Money | null;
    }
  >;
  groupById: Map<string, PeriodGroupNode>;
};

type AllocationBreakdown = {
  totalAmount: Money;
  items: ReturnType<typeof buildBreakdownItems>["items"];
  hierarchy: BreakdownHierarchyNode<Money>[];
  hasHiddenAmountDiscrepancy: boolean;
  hiddenAmountDiscrepancyNodeIds: string[];
  skippedMissingReferenceBalanceCount: number;
};

function collectAllocationBalances(args: AllocationBreakdownArgs) {
  const items: AllocationHierarchyItem[] = [];
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
    if (classified?.side === args.side) {
      items.push({ ...item, amount: classified.amount });
    }
  }
  return { items, skippedMissingReferenceBalanceCount };
}

export function buildPeriodEndAllocationBreakdown(
  args: AllocationBreakdownArgs,
): AllocationBreakdown {
  const { items, skippedMissingReferenceBalanceCount } =
    collectAllocationBalances(args);
  const {
    hierarchy,
    hasHiddenAmountDiscrepancy,
    hiddenAmountDiscrepancyNodeIds,
  } = buildAllocationHierarchy({ ...args, items });
  const topLevelBreakdown = buildBreakdownItems(
    hierarchy.map((node) => ({
      id: node.id,
      label: node.label,
      kind: node.kind,
      amount: node.amount,
    })),
  );
  const totalAmount = moneyRound2(moneySum(items.map((item) => item.amount)));

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
