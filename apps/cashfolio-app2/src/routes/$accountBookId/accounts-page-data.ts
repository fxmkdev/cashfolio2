import { useMemo } from "react";
import { ROOT_PARENT_KEY, type TreeRow } from "./accounts-page-types";

export type GroupBalanceAggregation = {
  sum: number;
  hasAccountDescendants: boolean;
  hasMissingReferenceBalance: boolean;
};

export function useRowsByParentKey(rows: TreeRow[]): Map<string, TreeRow[]> {
  return useMemo(() => {
    const siblingRowsByParentKey = new Map<string, TreeRow[]>();
    for (const row of rows) {
      const parentKey = row.parentId ?? ROOT_PARENT_KEY;
      const siblings = siblingRowsByParentKey.get(parentKey) ?? [];
      siblings.push(row);
      siblingRowsByParentKey.set(parentKey, siblings);
    }
    return siblingRowsByParentKey;
  }, [rows]);
}

export function useSelectedSiblingRows(
  rowsByParentKey: Map<string, TreeRow[]>,
  reorderingRow: { name: string; parentKey: string } | undefined,
) {
  return useMemo(() => {
    if (!reorderingRow) return [];
    return (rowsByParentKey.get(reorderingRow.parentKey) ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      nodeType: row.nodeType,
    }));
  }, [rowsByParentKey, reorderingRow]);
}

export function useBalanceInReferenceCurrencyByGroupId(
  rowsByParentKey: Map<string, TreeRow[]>,
  rows: TreeRow[],
): Map<string, GroupBalanceAggregation> {
  return useMemo(() => {
    const groupAggregationByGroupId = new Map<
      string,
      GroupBalanceAggregation
    >();

    const calculateGroupAggregation = (
      groupId: string,
    ): GroupBalanceAggregation => {
      const cachedAggregation = groupAggregationByGroupId.get(groupId);
      if (cachedAggregation) {
        return cachedAggregation;
      }

      let sum = 0;
      let hasAccountDescendants = false;
      let hasMissingReferenceBalance = false;
      const children = rowsByParentKey.get(groupId) ?? [];

      for (const child of children) {
        if (child.nodeType === "account") {
          hasAccountDescendants = true;
          if (child.balanceInReferenceCurrency == null) {
            hasMissingReferenceBalance = true;
          } else {
            sum += child.balanceInReferenceCurrency;
          }
          continue;
        }

        const childAggregation = calculateGroupAggregation(child.id);
        sum += childAggregation.sum;
        hasAccountDescendants =
          hasAccountDescendants || childAggregation.hasAccountDescendants;
        hasMissingReferenceBalance =
          hasMissingReferenceBalance ||
          childAggregation.hasMissingReferenceBalance;
      }

      const aggregation: GroupBalanceAggregation = {
        sum,
        hasAccountDescendants,
        hasMissingReferenceBalance,
      };
      groupAggregationByGroupId.set(groupId, aggregation);
      return aggregation;
    };

    for (const row of rows) {
      if (row.nodeType !== "accountGroup") continue;
      calculateGroupAggregation(row.id);
    }

    return groupAggregationByGroupId;
  }, [rowsByParentKey, rows]);
}
