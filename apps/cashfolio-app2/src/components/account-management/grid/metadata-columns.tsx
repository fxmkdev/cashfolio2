import type { ReportingGrouping } from "@/shared/reporting-grouping";
import type { ClassificationNode } from "@/shared/asset-class";
import { Text } from "@mantine/core";
import { type ColDef, type ICellRendererParams } from "ag-grid-enterprise";
import { type AccountsGridRow } from "./rows";
import type { AccountSetFilters } from "./use-set-filters";
import {
  getAccountListPathValue,
  getAccountListAssetClassValue,
  getAccountListTrackingMethodValue,
} from "./column-values";
export function buildAccountMetadataColumns({
  grouping,
  assetClasses,
  filters,
}: {
  grouping: ReportingGrouping;
  assetClasses: readonly ClassificationNode[];
  filters: AccountSetFilters;
}): ColDef<AccountsGridRow>[] {
  return [
    grouping === "assetClass"
      ? ({
          colId: "path",
          headerName: "Account Group",
          width: 220,
          resizable: true,
          sortable: false,
          ...filters.path,
          valueGetter: ({ data }) => getAccountListPathValue(data),
          tooltipValueGetter: ({ data }) => getAccountListPathValue(data),
        } satisfies ColDef<AccountsGridRow>)
      : ({
          colId: "assetClass",
          headerName: "Asset Class",
          width: 220,
          resizable: true,
          sortable: false,
          ...filters.assetClass,
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
      ...filters.trackingMethod,
      valueGetter: ({ data }) => getAccountListTrackingMethodValue(data),
      tooltipValueGetter: ({ data }) => getAccountListTrackingMethodValue(data),
    } satisfies ColDef<AccountsGridRow>,
  ];
}
