import { toMoney, type Money, moneyAdd } from "../../shared/money";
import { EquityAccountSubtype } from "../../.prisma-client/enums";
import type { BreakdownHierarchyAccumulatorItem } from "./period-helpers";

export type PeriodOverviewEquityAggregation = {
  income: Money;
  expenses: Money;
  explicitGainLoss: Money;
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
    income: toMoney(0),
    expenses: toMoney(0),
    explicitGainLoss: toMoney(0),
    expenseAmountByAccountId: new Map(),
    incomeAmountByAccountId: new Map(),
  };
}

function upsertBreakdownAmount(args: {
  targetMap: Map<string, BreakdownHierarchyAccumulatorItem>;
  account: AggregatedEquityBooking["account"];
  amount: Money;
}) {
  const existingItem = args.targetMap.get(args.account.id);
  if (existingItem) {
    existingItem.amount = moneyAdd(existingItem.amount, args.amount);
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
  convertedValue: Money;
  aggregation: PeriodOverviewEquityAggregation;
}) {
  if (
    args.booking.account.equityAccountSubtype === EquityAccountSubtype.INCOME
  ) {
    const incomeAmount = toMoney(args.convertedValue).neg();
    args.aggregation.income = moneyAdd(args.aggregation.income, incomeAmount);
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
    args.aggregation.expenses = moneyAdd(
      args.aggregation.expenses,
      expenseAmount,
    );
    upsertBreakdownAmount({
      targetMap: args.aggregation.expenseAmountByAccountId,
      account: args.booking.account,
      amount: expenseAmount,
    });
    return;
  }

  args.aggregation.explicitGainLoss = moneyAdd(
    args.aggregation.explicitGainLoss,
    toMoney(args.convertedValue).neg(),
  );
}
