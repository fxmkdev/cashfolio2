import type { ColDef } from "ag-grid-enterprise";
import { useMemo } from "react";
import { FORMATTED_NUMERIC_COLUMN } from "@/components/column-types";
import { DataGrid } from "@/components/data-grid";
import type { BreakdownHierarchyNode } from "./-breakdown-drill";
import { parseBreakdownAccountId } from "./-breakdown-drill";
import {
  type BreakdownTableRow,
  flattenBreakdownHierarchyRows,
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

  const columnDefs = useMemo<ColDef<BreakdownTableRow>[]>(
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
        valueGetter: ({ data }: { data: BreakdownTableRow | undefined }) =>
          data?.name,
        cellRendererParams: {
          suppressCount: true,
        },
      }}
      treeData={true}
      treeDataParentIdField="parentId"
      getRowId={({ data }) => data.id}
      onRowDoubleClicked={(event) => {
        if (!onAccountDoubleClick || event.data?.kind !== "account") {
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
