import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from "react";
import {
  PaginationModule,
  type ColDef,
  type GridApi,
} from "ag-grid-enterprise";
import { Button, Group, Pagination, Text } from "@mantine/core";
import { useUserLocale } from "@/user-locale-context";
import { DataGrid } from "../grid/data-grid";
import { TEXT_COLUMN } from "../grid/column-types";
import { getExchangeLabel } from "./exchange-label";
import { RESULTS_PAGE_SIZE, type SecurityListing } from "./types";
import classes from "./security-search.module.css";

const columns: ColDef<SecurityListing>[] = [
  { field: "name", headerName: "Name", minWidth: 240, flex: 2 },
  { field: "symbol", headerName: "Symbol", width: 120 },
  {
    field: "exchange",
    headerName: "Exchange",
    minWidth: 250,
    flex: 1,
    valueGetter: ({ data }) => (data ? getExchangeLabel(data) : "Unknown"),
    filter: "agSetColumnFilter",
  },
  {
    field: "country",
    headerName: "Country",
    width: 150,
    valueGetter: ({ data }) => data?.country ?? "Unknown",
    filter: "agSetColumnFilter",
  },
  {
    field: "hasHistory",
    headerName: "Historical Prices",
    width: 170,
    cellDataType: false,
    valueGetter: ({ data }) => (data?.hasHistory ? "Available" : "Unavailable"),
    filter: "agSetColumnFilter",
    filterParams: {
      suppressMiniFilter: true,
      values: ["Available", "Unavailable"],
    },
  },
];

const defaultColumn: ColDef<SecurityListing> = {
  type: TEXT_COLUMN,
  sortable: true,
  resizable: true,
  filter: "agTextColumnFilter",
  valueFormatter: ({ value }) => value ?? "Unknown",
};

type ResultsSummary = {
  filteredCount: number;
  totalPages: number;
  filtersActive: boolean;
};
export type SecurityResultsGridHandle = { focusListing: (id: string) => void };

export function SecurityResultsGrid({
  listings,
  page,
  selectedId,
  onPageChange,
  onSelect,
  ref,
}: {
  listings: SecurityListing[];
  page: number;
  selectedId: string | null;
  onPageChange: (page: number) => void;
  onSelect: (id: string | null) => void;
  ref?: Ref<SecurityResultsGridHandle>;
}) {
  const locale = useUserLocale();
  const [api, setApi] = useState<GridApi<SecurityListing> | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const [summary, setSummary] = useState<ResultsSummary>({
    filteredCount: listings.length,
    totalPages: Math.ceil(listings.length / RESULTS_PAGE_SIZE),
    filtersActive: false,
  });

  useImperativeHandle(
    ref,
    () => ({
      focusListing(id) {
        if (!api || api.isDestroyed()) return;
        const node = api.getRowNode(id);
        const first = api.paginationGetCurrentPage() * RESULTS_PAGE_SIZE;
        if (
          node?.displayed &&
          node.rowIndex != null &&
          node.rowIndex >= first &&
          node.rowIndex < first + RESULTS_PAGE_SIZE
        ) {
          api.ensureIndexVisible(node.rowIndex);
          api.setFocusedCell(node.rowIndex, "name");
        } else {
          container.current?.focus();
        }
      },
    }),
    [api],
  );

  useEffect(() => {
    if (!api || api.isDestroyed()) return;
    api.paginationGoToPage(page - 1);
  }, [api, page]);

  useEffect(() => {
    if (!api || api.isDestroyed()) return;
    // Each submission supplies new result rows, including repeated searches.
    api.setFilterModel(null);
  }, [api, listings]);

  useEffect(() => {
    if (!api || api.isDestroyed()) return;
    api.forEachNode((node) => {
      const selected = node.id === selectedId;
      if (node.isSelected() !== selected) node.setSelected(selected);
    });
  }, [api, listings, selectedId]);

  function reportModel(gridApi: GridApi<SecurityListing>) {
    const next = {
      filteredCount: gridApi.getDisplayedRowCount(),
      totalPages: gridApi.paginationGetTotalPages(),
      filtersActive: gridApi.isAnyFilterPresent(),
    };
    setSummary((previous) =>
      previous.filteredCount === next.filteredCount &&
      previous.totalPages === next.totalPages &&
      previous.filtersActive === next.filtersActive
        ? previous
        : next,
    );
    const nextPage = gridApi.paginationGetCurrentPage() + 1;
    if (nextPage !== page) onPageChange(nextPage);
  }

  const number = new Intl.NumberFormat(locale);
  return (
    <div className={classes.resultsGridArea}>
      <Group justify="space-between" mih={30}>
        <Text size="sm" role="status" aria-label="Result Count">
          Showing {number.format(summary.filteredCount)} of{" "}
          {number.format(listings.length)}{" "}
          {listings.length === 1 ? "listing" : "listings"}
        </Text>
        {summary.filtersActive && (
          <Button
            size="compact-sm"
            variant="subtle"
            onClick={() => api?.setFilterModel(null)}
          >
            Clear Filters
          </Button>
        )}
      </Group>
      <div
        className={classes.grid}
        ref={container}
        tabIndex={-1}
        role="region"
        aria-label="Security Results"
      >
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
          localeText={{ noMatchingRows: "No listings match the grid filters." }}
          onGridReady={({ api: readyApi }) => setApi(readyApi)}
          onModelUpdated={({ api: gridApi }) => reportModel(gridApi)}
          onFilterChanged={({ api: gridApi }) => reportModel(gridApi)}
          onPaginationChanged={({ api: gridApi }) => reportModel(gridApi)}
          onSelectionChanged={({ api: gridApi, source }) => {
            if (source !== "api")
              onSelect(gridApi.getSelectedRows()[0]?.id ?? null);
          }}
        />
      </div>
      <Group justify="space-between" gap="xs">
        <Text size="sm" c="dimmed">
          Select a listing to view details and prices.
        </Text>
        {summary.totalPages > 0 && (
          <Pagination
            aria-label="Results Pages"
            getControlProps={(control) => ({
              "aria-label": `${control[0].toUpperCase()}${control.slice(1)} Page`,
            })}
            getItemProps={(item) => ({ "aria-label": `Page ${item}` })}
            total={summary.totalPages}
            value={page}
            onChange={onPageChange}
            size="sm"
          />
        )}
      </Group>
    </div>
  );
}
