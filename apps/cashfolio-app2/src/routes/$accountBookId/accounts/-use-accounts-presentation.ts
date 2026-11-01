import { useMemo } from "react";
import { useAssetClasses } from "@/classification-context";
import type { AccountGainLossSummaries } from "@/shared/account-gain-loss";
import type { ReportingGrouping } from "@/shared/reporting-grouping";
import { buildAssetClassTree } from "./-asset-class-tree";
import { projectAssetClassGainLoss } from "./-asset-class-gain-loss";
import { useRowsWithGroupTrackingMethods } from "./-page-data-tracking-methods";
import {
  useRowsByParentKey,
  useRowsWithGroupAssetClasses,
  useBalanceInReferenceCurrencyByGroupId,
  useReferenceCurrencyBalanceTotal,
} from "./-page-data";
import {
  REFERENCE_CURRENCY_TOTAL_FOOTER_ROW_ID,
  type TreeRow,
  type ReferenceCurrencyTotalFooterRow,
} from "./-page-types";

function useRowsWithGroupSummaries(projectedRows: TreeRow[], enabled: boolean) {
  const children = useRowsByParentKey(projectedRows);
  const balanceInReferenceCurrencyByGroupId =
    useBalanceInReferenceCurrencyByGroupId(children, projectedRows, enabled);
  const classifiedRows = useRowsWithGroupAssetClasses(
    children,
    projectedRows,
    enabled,
  );
  const trackedRows = useRowsWithGroupTrackingMethods(
    children,
    classifiedRows,
    enabled,
  );
  const rows = useMemo(
    () =>
      trackedRows.map((row) => {
        if (row.nodeType !== "accountGroup") return row;
        const aggregation = balanceInReferenceCurrencyByGroupId.get(row.id);
        const balanceInReferenceCurrency =
          !aggregation?.hasAccountDescendants ||
          aggregation.hasMissingReferenceBalance
            ? null
            : aggregation.sum;
        return row.balanceInReferenceCurrency === balanceInReferenceCurrency
          ? row
          : { ...row, balanceInReferenceCurrency };
      }),
    [trackedRows, balanceInReferenceCurrencyByGroupId],
  );
  return { rows, balanceInReferenceCurrencyByGroupId };
}

/** Presentation only: requests and mutations stay with the production controller. */
export function useAccountsPresentation({
  sourceRows,
  grouping,
  isEquityTab,
  gainLossData,
}: {
  sourceRows: TreeRow[];
  grouping: ReportingGrouping;
  isEquityTab: boolean;
  gainLossData?: AccountGainLossSummaries;
}) {
  const classes = useAssetClasses();
  const projectedRows = useMemo(
    () =>
      grouping === "assetClass"
        ? buildAssetClassTree(sourceRows, classes)
        : sourceRows,
    [grouping, sourceRows, classes],
  );
  const { rows, balanceInReferenceCurrencyByGroupId } =
    useRowsWithGroupSummaries(projectedRows, !isEquityTab);
  const rowsByParentKey = useRowsByParentKey(rows);
  const projectedGainLoss = useMemo(
    () =>
      grouping === "assetClass"
        ? projectAssetClassGainLoss(gainLossData, projectedRows)
        : gainLossData,
    [grouping, gainLossData, projectedRows],
  );
  const total = useReferenceCurrencyBalanceTotal(rows, !isEquityTab);
  const pinnedBottomRowData: ReferenceCurrencyTotalFooterRow[] | undefined =
    isEquityTab
      ? undefined
      : [
          {
            id: REFERENCE_CURRENCY_TOTAL_FOOTER_ROW_ID,
            rowType: "referenceCurrencyTotalFooter",
            name: "Total",
            balanceInReferenceCurrency: total,
          },
        ];
  return {
    rows,
    rowsByParentKey,
    balanceInReferenceCurrencyByGroupId,
    gainLossData: projectedGainLoss,
    pinnedBottomRowData,
  };
}
