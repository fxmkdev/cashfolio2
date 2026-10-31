import { useMemo } from "react";
import type { TreeRow } from "./-page-types";

export function useRowsWithGroupTrackingMethods(
  rowsByParentKey: Map<string, TreeRow[]>,
  rows: TreeRow[],
  enabled = true,
): TreeRow[] {
  return useMemo(
    () =>
      enabled ? addGroupTrackingMethodSummaries(rowsByParentKey, rows) : rows,
    [enabled, rowsByParentKey, rows],
  );
}

export function addGroupTrackingMethodSummaries(
  rowsByParentKey: Map<string, TreeRow[]>,
  rows: TreeRow[],
): TreeRow[] {
  const summaries = new Map<string, TreeRow["groupTrackingMethod"]>();

  const summarizeGroup = (groupId: string): TreeRow["groupTrackingMethod"] => {
    if (summaries.has(groupId)) return summaries.get(groupId);

    let summary: TreeRow["groupTrackingMethod"];
    for (const child of rowsByParentKey.get(groupId) ?? []) {
      const childSummary =
        child.nodeType === "account"
          ? (child.trackingMethod ?? "INDIVIDUAL_UNITS")
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
    const groupTrackingMethod = summarizeGroup(row.id);
    return row.groupTrackingMethod === groupTrackingMethod
      ? row
      : { ...row, groupTrackingMethod };
  });
}
