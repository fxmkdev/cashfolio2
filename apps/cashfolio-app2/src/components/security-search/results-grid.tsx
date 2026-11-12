import { useEffect, useState } from "react";
import {
  PaginationModule,
  type ColDef,
  type GridApi,
} from "ag-grid-enterprise";
import { DataGrid } from "../grid/data-grid";
import { TEXT_COLUMN } from "../grid/column-types";
import { RESULTS_PAGE_SIZE, type SecurityListing } from "./types";
import classes from "./security-search.module.css";

const columns: ColDef<SecurityListing>[] = [
  { field: "name", headerName: "Name", minWidth: 260, flex: 2 },
  { field: "symbol", headerName: "Symbol", width: 130 },
  { field: "exchange", headerName: "Exchange", minWidth: 200, flex: 1 },
  { field: "mic", headerName: "MIC", width: 100 },
  { field: "country", headerName: "Country", width: 150 },
  {
    field: "hasHistory",
    headerName: "Historical Prices",
    width: 170,
    cellDataType: false,
    valueFormatter: ({ value }) => (value ? "Available" : "Unavailable"),
  },
];

const defaultColumn: ColDef<SecurityListing> = {
  type: TEXT_COLUMN,
  sortable: true,
  resizable: true,
  valueFormatter: ({ value }) => value ?? "Unknown",
};

export function SecurityResultsGrid({
  listings,
  page,
  selectedId,
  onPageChange,
  onSelect,
}: {
  listings: SecurityListing[];
  page: number;
  selectedId: string | null;
  onPageChange: (page: number) => void;
  onSelect: (id: string | null) => void;
}) {
  const [api, setApi] = useState<GridApi<SecurityListing> | null>(null);

  useEffect(() => {
    if (!api || api.isDestroyed()) return;
    api.paginationGoToPage(page - 1);
  }, [api, page]);

  useEffect(() => {
    if (!api || api.isDestroyed()) return;
    api.forEachNode((node) => {
      const selected = node.id === selectedId;
      if (node.isSelected() !== selected) node.setSelected(selected);
    });
  }, [api, listings, selectedId]);

  return (
    <div className={classes.grid} aria-label="Security Results">
      <DataGrid
        modules={[PaginationModule]}
        rowData={listings}
        columnDefs={columns}
        defaultColDef={defaultColumn}
        getRowId={({ data }) => data.id}
        rowSelection={{
          mode: "singleRow",
          checkboxes: false,
          enableClickSelection: true,
        }}
        pagination
        paginationPageSize={RESULTS_PAGE_SIZE}
        paginationPageSizeSelector={false}
        suppressPaginationPanel
        onGridReady={({ api: readyApi }) => setApi(readyApi)}
        onPaginationChanged={({ api: gridApi, newPage }) => {
          const nextPage = gridApi.paginationGetCurrentPage() + 1;
          if (newPage && nextPage !== page) onPageChange(nextPage);
        }}
        onSelectionChanged={({ api: gridApi, source }) => {
          // Controlled selection updates must not feed back into the controller.
          if (source !== "api") {
            onSelect(gridApi.getSelectedRows()[0]?.id ?? null);
          }
        }}
      />
    </div>
  );
}
