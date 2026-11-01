import type { ReportingGrouping } from "@/shared/reporting-grouping";
import type { ClassificationNode } from "@/shared/asset-class";
import { Text } from "@mantine/core";
import { type ColDef, type ICellRendererParams } from "ag-grid-enterprise";
import { type AccountsGridRow } from "./-page-types";
import {
  getAccountListPathValue,
  getAccountListAssetClassValue,
  getAccountListTrackingMethodValue,
} from "./-account-column-values";
export function buildAccountMetadataColumns({
  grouping,
  assetClasses,
}: {
  grouping: ReportingGrouping;
  assetClasses: readonly ClassificationNode[];
}): ColDef<AccountsGridRow>[] {
  return [
    grouping === "assetClass"
      ? ({
          colId: "path",
          headerName: "Path",
          width: 220,
          resizable: true,
          sortable: false,
          filter: "agTextColumnFilter",
          valueGetter: ({ data }) => getAccountListPathValue(data),
          tooltipValueGetter: ({ data }) => getAccountListPathValue(data),
        } satisfies ColDef<AccountsGridRow>)
      : ({
          colId: "assetClass",
          headerName: "Asset Class",
          width: 220,
          resizable: true,
          sortable: false,
          filter: "agTextColumnFilter",
          valueGetter: ({ data }) =>
            getAccountListAssetClassValue(data, assetClasses),
          tooltipValueGetter: ({ data }) =>
            getAccountListAssetClassValue(data, assetClasses),
          cellRenderer: ({
            value,
          }: ICellRendererParams<AccountsGridRow, string | undefined>) =>
            value === "Unclassified" ? (
              <Text component="span" inherit c="dimmed">
                {value}
              </Text>
            ) : (
              (value ?? null)
            ),
        } satisfies ColDef<AccountsGridRow>),
    {
      colId: "trackingMethod",
      headerName: "Tracking Method",
      initialWidth: 220,
      resizable: true,
      sortable: false,
      filter: "agTextColumnFilter",
      valueGetter: ({ data }) => getAccountListTrackingMethodValue(data),
      tooltipValueGetter: ({ data }) => getAccountListTrackingMethodValue(data),
    } satisfies ColDef<AccountsGridRow>,
  ];
}
