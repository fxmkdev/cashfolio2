import {
  type PeriodGroupNode,
  type BreakdownBucket,
  getTopLevelGroup,
  type ExpenseBreakdownAccumulatorItem,
} from "./period-breakdown-state";
import {
  type Money,
  toMoney,
  moneySum,
  moneyRound2 as round2,
  moneyMultiply,
  moneyDivide,
} from "../../../shared/money";

export function createBreakdownBucket(args: {
  accountId: string;
  accountName: string;
  groupId: string | null;
  groupById: Map<string, PeriodGroupNode>;
}): BreakdownBucket {
  if (args.groupId) {
    const topLevelGroup = getTopLevelGroup({
      groupId: args.groupId,
      groupById: args.groupById,
    });

    if (topLevelGroup) {
      return {
        id: `group:${topLevelGroup.id}`,
        label: topLevelGroup.name,
        kind: "group",
      };
    }
  }

  return {
    id: `account:${args.accountId}`,
    label: args.accountName,
    kind: "account",
  };
}

export function buildBreakdownItems(items: ExpenseBreakdownAccumulatorItem[]): {
  totalAmount: Money;
  items: Array<{
    id: string;
    label: string;
    kind: "group" | "account";
    amount: Money;
    percentage: Money;
  }>;
} {
  const positiveItems = items.filter(
    (item) => toMoney(item.amount).comparedTo(0) > 0,
  );
  const totalRaw = moneySum(positiveItems.map((item) => item.amount));

  const sortedItems = positiveItems
    .map((item) => ({
      ...item,
      amount: round2(item.amount),
      percentage:
        toMoney(totalRaw).comparedTo(0) <= 0
          ? toMoney(0)
          : round2(moneyMultiply(moneyDivide(item.amount, totalRaw), 100)),
    }))
    .sort((a, b) => toMoney(b.amount).comparedTo(a.amount));

  return {
    totalAmount: round2(moneySum(sortedItems.map((item) => item.amount))),
    items: sortedItems,
  };
}
