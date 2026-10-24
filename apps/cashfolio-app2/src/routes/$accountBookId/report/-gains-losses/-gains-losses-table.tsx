import type { ColDef } from "ag-grid-enterprise";
import { useMemo } from "react";
import { FORMATTED_NUMERIC_COLUMN } from "@/components/grid/column-types";
import { DataGrid } from "@/components/grid/data-grid";
import { useExpandedGroups } from "@/hooks/use-expanded-groups";
import type { GainsLossesBreakdownNode } from "./-gains-losses-breakdown-types";
import {
  GAINS_LOSSES_TOTAL_FOOTER_ROW_ID,
  type GainsLossesGridRow,
  type GainsLossesTotalFooterRow,
  flattenGainsLossesHierarchyRows,
  sumTopLevelRealizedGainLoss,
  sumTopLevelTotalGainLoss,
  sumTopLevelUnrealizedGainLoss,
} from "./-gains-losses-table-rows";

type GainsLossesTableProps = {
  hierarchy: GainsLossesBreakdownNode[];
  displayDecimals?: number;
  expandedGroupsStorageKey: string;
  onUnitAccountDoubleClick?: (accountId: string) => void;
};

export function GainsLossesTable({
  hierarchy,
  displayDecimals = 2,
  expandedGroupsStorageKey,
  onUnitAccountDoubleClick,
}: GainsLossesTableProps) {
  const rowData = useMemo(
    () => flattenGainsLossesHierarchyRows(hierarchy),
    [hierarchy],
  );
  const pinnedBottomRowData = useMemo<GainsLossesTotalFooterRow[]>(
    () => [
      {
        id: GAINS_LOSSES_TOTAL_FOOTER_ROW_ID,
        rowType: "gainsLossesTotalFooter",
        name: "Total",
        realizedGainLoss: sumTopLevelRealizedGainLoss(hierarchy),
        unrealizedGainLoss: sumTopLevelUnrealizedGainLoss(hierarchy),
        totalGainLoss: sumTopLevelTotalGainLoss(hierarchy),
      },
    ],
    [hierarchy],
  );
  const { isGroupOpenByDefault, onRowGroupOpened } = useExpandedGroups(
    expandedGroupsStorageKey,
  );

  const columnDefs = useMemo<ColDef<GainsLossesGridRow>[]>(
    () => [
      {
        field: "totalGainLoss",
        headerName: "Total",
        width: 170,
        type: FORMATTED_NUMERIC_COLUMN,
        context: {
          formattedNumeric: {
            getDisplayDecimals: () => displayDecimals,
          },
        },
        filter: "agNumberColumnFilter",
      },
    ],
    [displayDecimals],
  );

  return (
    <DataGrid
      containerStyle={{ height: 440 }}
      rowData={rowData}
      columnDefs={columnDefs}
      defaultColDef={{
        sortable: false,
        suppressHeaderMenuButton: true,
      }}
      autoGroupColumnDef={{
        headerName: "Asset Class / Account",
        field: "name",
        width: 475,
        suppressSizeToFit: true,
        filter: "agTextColumnFilter",
        valueGetter: ({ data }: { data: GainsLossesGridRow | undefined }) =>
          data?.name,
        cellRendererParams: {
          suppressCount: true,
        },
      }}
      treeData={true}
      treeDataParentIdField="parentId"
      pinnedBottomRowData={pinnedBottomRowData}
      getRowId={({ data }) => {
        if (!data) {
          throw new Error(
            "GainsLossesTable row is missing data. Row IDs must be stable and non-empty.",
          );
        }

        return data.id;
      }}
      isGroupOpenByDefault={isGroupOpenByDefault}
      onRowGroupOpened={onRowGroupOpened}
      onRowDoubleClicked={(event) => {
        if (!event.data) {
          return;
        }

        if (event.data.accountId)
          onUnitAccountDoubleClick?.(event.data.accountId);
      }}
    />
  );
}
