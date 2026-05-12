import { EquityAccountSubtype } from "../../.prisma-client/enums";
import type { BreakdownHierarchyAccumulatorItem } from "./period-helpers";

export type PeriodOverviewEquityAggregation = {
  income: number;
  expenses: number;
  explicitGainLoss: number;
  expenseAmountByAccountId: Map<string, BreakdownHierarchyAccumulatorItem>;
  incomeAmountByAccountId: Map<string, BreakdownHierarchyAccumulatorItem>;
};

type AggregatedEquityBooking = {
  account: {
    id: string;
    name: string;
    groupId: string | null;
    equityAccountSubtype: EquityAccountSubtype | null;
  };
};

export function createPeriodOverviewEquityAggregation(): PeriodOverviewEquityAggregation {
  return {
    income: 0,
    expenses: 0,
    explicitGainLoss: 0,
    expenseAmountByAccountId: new Map(),
    incomeAmountByAccountId: new Map(),
  };
}

function upsertBreakdownAmount(args: {
  targetMap: Map<string, BreakdownHierarchyAccumulatorItem>;
  account: AggregatedEquityBooking["account"];
  amount: number;
}) {
  const existingItem = args.targetMap.get(args.account.id);
  if (existingItem) {
    existingItem.amount += args.amount;
    return;
  }

  args.targetMap.set(args.account.id, {
    accountId: args.account.id,
    accountName: args.account.name,
    groupId: args.account.groupId,
    amount: args.amount,
  });
}

export function accumulateConvertedEquityBooking(args: {
  booking: AggregatedEquityBooking;
  convertedValue: number;
  aggregation: PeriodOverviewEquityAggregation;
}) {
  if (
    args.booking.account.equityAccountSubtype === EquityAccountSubtype.INCOME
  ) {
    const incomeAmount = -args.convertedValue;
    args.aggregation.income += incomeAmount;
    upsertBreakdownAmount({
      targetMap: args.aggregation.incomeAmountByAccountId,
      account: args.booking.account,
      amount: incomeAmount,
    });
    return;
  }

  if (
    args.booking.account.equityAccountSubtype === EquityAccountSubtype.EXPENSE
  ) {
    const expenseAmount = args.convertedValue;
    args.aggregation.expenses += expenseAmount;
    upsertBreakdownAmount({
      targetMap: args.aggregation.expenseAmountByAccountId,
      account: args.booking.account,
      amount: expenseAmount,
    });
    return;
  }

  args.aggregation.explicitGainLoss += -args.convertedValue;
}
