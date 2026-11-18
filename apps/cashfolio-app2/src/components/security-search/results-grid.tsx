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
} from "ag-grid-enterprise";
import { Alert, Button, Group, Pagination, Text } from "@mantine/core";
import { useUserLocale } from "@/user-locale-context";
import { getHistoryLabel } from "@/shared/securities/contracts";
import { DataGrid } from "../grid/data-grid";
import { TEXT_COLUMN } from "../grid/column-types";
import { getExchangeLabel } from "./exchange-label";
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
  const [totalCount, setTotalCount] = useState(0);
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
    return [
      { field: "name", headerName: "Name", minWidth: 240, flex: 2 },
      { field: "symbol", headerName: "Symbol", width: 120 },
      {
        field: "exchange",
        headerName: "Exchange",
        minWidth: 250,
        flex: 1,
        valueGetter: ({ data }) => (data ? getExchangeLabel(data) : "Unknown"),
      },
      {
        field: "country",
        headerName: "Country",
        width: 150,
        valueGetter: ({ data }) => data?.country ?? "Unknown",
      },
      {
        field: "hasHistory",
        headerName: "Historical Prices",
        width: 170,
        cellDataType: false,
        valueGetter: ({ data }) => getHistoryLabel(data?.hasHistory ?? null),
      },
    ];
  }, []);
  const datasource = useMemo<IServerSideDatasource<SecurityListing>>(
    () => ({
      async getRows(params) {
        const controller = new AbortController();
        requests.current.add(controller);
        const requestId = ++latestRequest.current;
        try {
          const result = await source.loadPage(
            { offset: params.request.startRow ?? 0, limit: RESULTS_PAGE_SIZE },
            controller.signal,
          );
          if (controller.signal.aborted) return;
          if (requestId === latestRequest.current) {
            setError(null);
            setTotalCount(result.totalCount);
          }
          params.success({
            rowData: result.rows,
            rowCount: result.totalCount,
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
          {number.format(totalCount)}{" "}
          {totalCount === 1 ? "listing" : "listings"}
        </Text>
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
          localeText={{ noRowsToShow: "No securities found." }}
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
        {totalCount > 0 && (
          <Pagination
            aria-label="Results Pages"
            getControlProps={(control) => ({
              "aria-label": `${control[0].toUpperCase()}${control.slice(1)} Page`,
            })}
            getItemProps={(item) => ({ "aria-label": `Page ${item}` })}
            total={Math.ceil(totalCount / RESULTS_PAGE_SIZE)}
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
  sortable: false,
  resizable: true,
  filter: false,
  floatingFilter: false,
  suppressHeaderFilterButton: true,
  suppressHeaderMenuButton: true,
  valueFormatter: ({ value }) => value ?? "Unknown",
};
