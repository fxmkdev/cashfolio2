import { useMemo } from "react";
import {
  ROOT_PARENT_KEY,
  type GroupAssetClassSummary,
  type TreeRow,
} from "./-page-types";

export type GroupBalanceAggregation = {
  sum: number;
  hasAccountDescendants: boolean;
  hasMissingReferenceBalance: boolean;
};

const EMPTY_GROUP_BALANCE_AGGREGATION_BY_GROUP_ID = new Map<
  string,
  GroupBalanceAggregation
>();

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

export function useRowsWithGroupAssetClasses(
  rowsByParentKey: Map<string, TreeRow[]>,
  rows: TreeRow[],
  enabled = true,
): TreeRow[] {
  return useMemo(
    () => (enabled ? addGroupAssetClassSummaries(rowsByParentKey, rows) : rows),
    [enabled, rowsByParentKey, rows],
  );
}

export function addGroupAssetClassSummaries(
  rowsByParentKey: Map<string, TreeRow[]>,
  rows: TreeRow[],
): TreeRow[] {
  const summaries = new Map<string, GroupAssetClassSummary | undefined>();

  const summarizeGroup = (
    groupId: string,
  ): GroupAssetClassSummary | undefined => {
    if (summaries.has(groupId)) return summaries.get(groupId);

    let summary: GroupAssetClassSummary | undefined;
    for (const child of rowsByParentKey.get(groupId) ?? []) {
      const childSummary =
        child.nodeType === "account"
          ? (child.assetClassId ?? null)
          : summarizeGroup(child.id);
      if (childSummary === undefined) continue;
      summary =
        summary === undefined || summary === childSummary
          ? childSummary
          : "Mixed";
    }

    summaries.set(groupId, summary);
    return summary;
  };

  return rows.map((row) => {
    if (row.nodeType !== "accountGroup") return row;
    const groupAssetClass = summarizeGroup(row.id);
    return row.groupAssetClass === groupAssetClass
      ? row
      : { ...row, groupAssetClass };
  });
}

export function useSelectedSiblingRows(
  rowsByParentKey: Map<string, TreeRow[]>,
  reorderingRow: { name: string; parentKey: string } | undefined,
) {
  return useMemo(() => {
    if (!reorderingRow) return [];
    return (rowsByParentKey.get(reorderingRow.parentKey) ?? [])
      .filter((row) => !row.isVirtualArchivedGroup)
      .map((row) => ({
        id: row.id,
        name: row.name,
        nodeType: row.nodeType,
      }));
  }, [rowsByParentKey, reorderingRow]);
}

export function useReferenceCurrencyBalanceTotal(
  rows: TreeRow[],
  enabled = true,
): number | null {
  return useMemo(() => {
    if (!enabled) return null;

    let sum = 0;

    for (const row of rows) {
      if (row.nodeType !== "account") continue;
      if (row.balanceInReferenceCurrency == null) return null;
      sum += row.balanceInReferenceCurrency;
    }

    return sum;
  }, [enabled, rows]);
}

export function useBalanceInReferenceCurrencyByGroupId(
  rowsByParentKey: Map<string, TreeRow[]>,
  rows: TreeRow[],
  enabled = true,
): Map<string, GroupBalanceAggregation> {
  return useMemo(
    () =>
      calculateBalanceInReferenceCurrencyByGroupId(
        rowsByParentKey,
        rows,
        enabled,
      ),
    [enabled, rowsByParentKey, rows],
  );
}

export function calculateBalanceInReferenceCurrencyByGroupId(
  rowsByParentKey: Map<string, TreeRow[]>,
  rows: TreeRow[],
  enabled = true,
): Map<string, GroupBalanceAggregation> {
  if (!enabled) {
    return EMPTY_GROUP_BALANCE_AGGREGATION_BY_GROUP_ID;
  }

  const groupAggregationByGroupId = new Map<string, GroupBalanceAggregation>();

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
}
