import { useMemo } from "react";
import {
  calculateBalanceInReferenceCurrencyByGroupId,
  calculateReferenceCurrencyBalanceTotal,
  type GroupBalanceAggregation,
} from "./-reference-balance-aggregation";
export {
  calculateBalanceInReferenceCurrencyByGroupId,
  type GroupBalanceAggregation,
} from "./-reference-balance-aggregation";
import {
  ROOT_PARENT_KEY,
  type GroupAssetClassSummary,
  type TreeRow,
} from "./-page-types";

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
  return useMemo(
    () => (enabled ? calculateReferenceCurrencyBalanceTotal(rows) : null),
    [enabled, rows],
  );
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
