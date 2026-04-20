import type { ColDef } from "ag-grid-enterprise";
import { useMemo } from "react";
import { FORMATTED_NUMERIC_COLUMN } from "@/components/column-types";
import { DataGrid } from "@/components/data-grid";
import type { BreakdownHierarchyNode } from "./-breakdown-drill";
import { parseBreakdownAccountId } from "./-breakdown-drill";
import {
  BREAKDOWN_TOTAL_FOOTER_ROW_ID,
  type BreakdownGridRow,
  type BreakdownTotalFooterRow,
  flattenBreakdownHierarchyRows,
  isBreakdownTotalFooterRow,
  sumTopLevelBreakdownHierarchyAmount,
} from "./-breakdown-table-rows";

type BreakdownTableProps = {
  hierarchy: BreakdownHierarchyNode[];
  valueHeaderName: string;
  onAccountDoubleClick?: (accountId: string) => void;
};

export function BreakdownTable({
  hierarchy,
  valueHeaderName,
  onAccountDoubleClick,
}: BreakdownTableProps) {
  const rowData = useMemo(
    () => flattenBreakdownHierarchyRows(hierarchy),
    [hierarchy],
  );
  const pinnedBottomRowData = useMemo<BreakdownTotalFooterRow[]>(
    () => [
      {
        id: BREAKDOWN_TOTAL_FOOTER_ROW_ID,
        rowType: "breakdownTotalFooter",
        name: "Total",
        value: sumTopLevelBreakdownHierarchyAmount(hierarchy),
      },
    ],
    [hierarchy],
  );

  const columnDefs = useMemo<ColDef<BreakdownGridRow>[]>(
    () => [
      {
        field: "value",
        headerName: valueHeaderName,
        width: 170,
        type: FORMATTED_NUMERIC_COLUMN,
        filter: "agNumberColumnFilter",
      },
    ],
    [valueHeaderName],
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
        headerName: "Name",
        field: "name",
        flex: 1,
        filter: "agTextColumnFilter",
        valueGetter: ({ data }: { data: BreakdownGridRow | undefined }) =>
          data?.name,
        cellRendererParams: {
          suppressCount: true,
        },
      }}
      treeData={true}
      treeDataParentIdField="parentId"
      pinnedBottomRowData={pinnedBottomRowData}
      getRowId={({ data }) => data?.id ?? ""}
      onRowDoubleClicked={(event) => {
        if (!onAccountDoubleClick || !event.data) {
          return;
        }

        if (
          isBreakdownTotalFooterRow(event.data) ||
          event.data.kind !== "account"
        ) {
          return;
        }

        const accountId = parseBreakdownAccountId(event.data.id);
        if (!accountId) {
          return;
        }

        onAccountDoubleClick(accountId);
      }}
    />
  );
}
