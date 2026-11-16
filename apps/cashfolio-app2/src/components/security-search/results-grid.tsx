import {
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type Ref,
} from "react";
import {
  PaginationModule,
  ServerSideRowModelModule,
  ServerSideRowModelApiModule,
  type ColDef,
  type GridApi,
  type IServerSideDatasource,
  type ISetFilterParams,
} from "ag-grid-enterprise";
import { Alert, Button, Group, Pagination, Text } from "@mantine/core";
import { useUserLocale } from "@/user-locale-context";
import { getHistoryLabel } from "@/shared/securities/contracts";
import { DataGrid } from "../grid/data-grid";
import { TEXT_COLUMN } from "../grid/column-types";
import { getExchangeLabel } from "./exchange-label";
import { gridQuery } from "./grid-query";
import {
  RESULTS_PAGE_SIZE,
  type SecurityListing,
  type SecuritiesDataSource,
} from "./types";
import classes from "./security-search.module.css";

export type SecurityResultsGridHandle = { focusListing: (id: string) => void };
export function SecurityResultsGrid({
  source,
  page,
  selectedId,
  onPageChange,
  onSelect,
  ref,
}: {
  source: SecuritiesDataSource;
  page: number;
  selectedId: string | null;
  onPageChange: (page: number) => void;
  onSelect: (id: string | null) => void;
  ref?: Ref<SecurityResultsGridHandle>;
}) {
  const locale = useUserLocale();
  const [api, setApi] = useState<GridApi<SecurityListing> | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const [summary, setSummary] = useState({
    filteredCount: 0,
    totalCount: 0,
    filtersActive: false,
  });
  const latestRequest = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const requests = useRef(new Set<AbortController>());
  useEffect(() => {
    const pending = requests.current;
    return () => {
      for (const request of pending) request.abort();
      pending.clear();
    };
  }, [source]);
  const columns = useMemo<ColDef<SecurityListing>[]>(() => {
    const setFilter = (column: "exchange" | "country" | "hasHistory") =>
      ({
        values: (params) => {
          const controller = new AbortController();
          requests.current.add(controller);
          void source
            .loadFilterOptions(controller.signal)
            .then((options) => {
              if (!controller.signal.aborted) params.success(options[column]);
            })
            .catch(() => {
              if (!controller.signal.aborted) {
                params.success([]);
                setError("Filter options could not be loaded. Try again.");
              }
            })
            .finally(() => requests.current.delete(controller));
        },
        suppressClearModelOnRefreshValues: true,
        refreshValuesOnOpen: true,
      }) satisfies Partial<ISetFilterParams<SecurityListing>>;
    return [
      { field: "name", headerName: "Name", minWidth: 240, flex: 2 },
      { field: "symbol", headerName: "Symbol", width: 120 },
      {
        field: "exchange",
        headerName: "Exchange",
        minWidth: 250,
        flex: 1,
        valueGetter: ({ data }) => (data ? getExchangeLabel(data) : "Unknown"),
        filter: "agSetColumnFilter",
        filterParams: setFilter("exchange"),
      },
      {
        field: "country",
        headerName: "Country",
        width: 150,
        valueGetter: ({ data }) => data?.country ?? "Unknown",
        filter: "agSetColumnFilter",
        filterParams: setFilter("country"),
      },
      {
        field: "hasHistory",
        headerName: "Historical Prices",
        width: 170,
        cellDataType: false,
        valueGetter: ({ data }) => getHistoryLabel(data?.hasHistory ?? null),
        filter: "agSetColumnFilter",
        filterParams: { ...setFilter("hasHistory"), suppressMiniFilter: true },
      },
    ];
  }, [source]);
  const datasource = useMemo<IServerSideDatasource<SecurityListing>>(
    () => ({
      async getRows(params) {
        const controller = new AbortController();
        requests.current.add(controller);
        const requestId = ++latestRequest.current;
        try {
          const result = await source.loadPage(
            gridQuery(params.request),
            controller.signal,
          );
          if (controller.signal.aborted) return;
          if (requestId === latestRequest.current) {
            setError(null);
            setSummary({
              filteredCount: result.filteredCount,
              totalCount: result.totalCount,
              filtersActive:
                Object.keys(params.request.filterModel ?? {}).length > 0,
            });
          }
          params.success({
            rowData: result.rows,
            rowCount: result.filteredCount,
          });
        } catch (cause) {
          if (controller.signal.aborted) return;
          if (requestId === latestRequest.current)
            setError(
              cause instanceof Error
                ? cause.message
                : "Securities could not be loaded. Try again.",
            );
          params.fail();
        } finally {
          requests.current.delete(controller);
        }
      },
    }),
    [source],
  );
  function syncSelection(gridApi: GridApi<SecurityListing>) {
    gridApi.forEachNode((node) => {
      if (node.isSelected() !== (node.id === selectedId))
        node.setSelected(node.id === selectedId);
    });
  }
  useEffect(() => {
    if (!api || api.isDestroyed()) return;
    api.paginationGoToPage(page - 1);
  }, [api, page]);
  useEffect(() => {
    if (!api || api.isDestroyed()) return;
    api.forEachNode((node) => {
      if (node.isSelected() !== (node.id === selectedId))
        node.setSelected(node.id === selectedId);
    });
  }, [api, selectedId]);
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
        } else container.current?.focus();
      },
    }),
    [api],
  );
  const number = new Intl.NumberFormat(locale);
  return (
    <div className={classes.resultsGridArea}>
      {error && (
        <Alert color="red" role="alert">
          <Text size="sm">{error}</Text>
          <Button
            variant="light"
            onClick={() => api?.refreshServerSide({ purge: true })}
          >
            Retry Results
          </Button>
        </Alert>
      )}
      <Group justify="space-between" mih={30}>
        <Text size="sm" role="status" aria-label="Result Count">
          Showing {number.format(summary.filteredCount)} of{" "}
          {number.format(summary.totalCount)}{" "}
          {summary.totalCount === 1 ? "listing" : "listings"}
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
          modules={[
            PaginationModule,
            ServerSideRowModelModule,
            ServerSideRowModelApiModule,
          ]}
          rowModelType="serverSide"
          serverSideDatasource={datasource}
          cacheBlockSize={RESULTS_PAGE_SIZE}
          maxBlocksInCache={3}
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
          localeText={{
            noMatchingRows: "No listings match the grid filters.",
            noRowsToShow: summary.filtersActive
              ? "No listings match the grid filters."
              : "No securities found.",
          }}
          onGridReady={({ api: readyApi }) => setApi(readyApi)}
          onModelUpdated={({ api: gridApi }) => syncSelection(gridApi)}
          onPaginationChanged={({ api: gridApi }) => {
            const next = gridApi.paginationGetCurrentPage() + 1;
            if (next !== page) onPageChange(next);
          }}
          onSelectionChanged={({ api: gridApi, source: eventSource }) => {
            if (
              eventSource === "rowClicked" ||
              eventSource === "spaceKey" ||
              eventSource === "checkboxSelected"
            )
              onSelect(gridApi.getSelectedRows()[0]?.id ?? null);
          }}
        />
      </div>
      <Group justify="space-between" gap="xs">
        <Text size="sm" c="dimmed">
          Select a listing to view details and prices.
        </Text>
        {summary.filteredCount > 0 && (
          <Pagination
            aria-label="Results Pages"
            getControlProps={(control) => ({
              "aria-label": `${control[0].toUpperCase()}${control.slice(1)} Page`,
            })}
            getItemProps={(item) => ({ "aria-label": `Page ${item}` })}
            total={Math.ceil(summary.filteredCount / RESULTS_PAGE_SIZE)}
            value={page}
            onChange={onPageChange}
            size="sm"
          />
        )}
      </Group>
    </div>
  );
}
const defaultColumn: ColDef<SecurityListing> = {
  type: TEXT_COLUMN,
  sortable: true,
  resizable: true,
  filter: "agTextColumnFilter",
  filterParams: {
    maxNumConditions: 1,
    filterOptions: [
      "contains",
      "notContains",
      "equals",
      "notEqual",
      "startsWith",
      "endsWith",
    ],
  },
  valueFormatter: ({ value }) => value ?? "Unknown",
};
