import { moneyAdd, toMoney, toMoneyNumber, type Money } from "@/shared/money";
import type { TreeRow } from "./-page-types";

export type GroupBalanceAggregation = {
  sum: number;
  hasAccountDescendants: boolean;
  hasMissingReferenceBalance: boolean;
};
type DecimalGroupAggregation = Omit<GroupBalanceAggregation, "sum"> & {
  sum: Money;
};
const EMPTY_GROUP_BALANCE_AGGREGATION_BY_GROUP_ID = new Map<
  string,
  GroupBalanceAggregation
>();

export function calculateReferenceCurrencyBalanceTotal(
  rows: TreeRow[],
): number | null {
  let sum = toMoney(0);
  for (const row of rows) {
    if (row.nodeType !== "account") continue;
    if (row.balanceInReferenceCurrency == null) return null;
    sum = moneyAdd(sum, row.balanceInReferenceCurrency);
  }
  return toMoneyNumber(sum);
}

function calculateGroupAggregation(
  groupId: string,
  rowsByParentKey: Map<string, TreeRow[]>,
  cache: Map<string, DecimalGroupAggregation>,
): DecimalGroupAggregation {
  const cached = cache.get(groupId);
  if (cached) return cached;
  let sum = toMoney(0);
  let hasAccountDescendants = false;
  let hasMissingReferenceBalance = false;
  for (const child of rowsByParentKey.get(groupId) ?? []) {
    if (child.nodeType === "account") {
      hasAccountDescendants = true;
      if (child.balanceInReferenceCurrency == null)
        hasMissingReferenceBalance = true;
      else sum = moneyAdd(sum, child.balanceInReferenceCurrency);
    } else {
      const aggregation = calculateGroupAggregation(
        child.id,
        rowsByParentKey,
        cache,
      );
      sum = moneyAdd(sum, aggregation.sum);
      hasAccountDescendants ||= aggregation.hasAccountDescendants;
      hasMissingReferenceBalance ||= aggregation.hasMissingReferenceBalance;
    }
  }
  const result = { sum, hasAccountDescendants, hasMissingReferenceBalance };
  cache.set(groupId, result);
  return result;
}

/** Preserve decimal precision through all ancestors before creating display values. */
export function calculateBalanceInReferenceCurrencyByGroupId(
  rowsByParentKey: Map<string, TreeRow[]>,
  rows: TreeRow[],
  enabled = true,
): Map<string, GroupBalanceAggregation> {
  if (!enabled) return EMPTY_GROUP_BALANCE_AGGREGATION_BY_GROUP_ID;
  const cache = new Map<string, DecimalGroupAggregation>();
  for (const row of rows) {
    if (row.nodeType === "accountGroup")
      calculateGroupAggregation(row.id, rowsByParentKey, cache);
  }
  return new Map(
    [...cache].map(([id, aggregation]) => [
      id,
      { ...aggregation, sum: toMoneyNumber(aggregation.sum) },
    ]),
  );
}
