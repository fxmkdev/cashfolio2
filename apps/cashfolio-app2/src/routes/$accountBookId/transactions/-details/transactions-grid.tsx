import { DataGrid } from "@/components/grid/data-grid";
import type { BulkTransactionActions } from "@/hooks/use-bulk-transaction-actions";
import { Drawer, Flex, VisuallyHidden, useMantineTheme } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import type {
  CellClickedEvent,
  CellKeyDownEvent,
  ColumnState,
  GridApi,
} from "ag-grid-enterprise";
import type { AgGridReactProps } from "ag-grid-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { TransactionsBookingRow, TransactionsRow } from "../-page-types";
import { BookingDetails, type TransactionActions } from "./booking-details";
import classes from "./details.module.css";

const DEFAULT_COL_DEF = {
  sortable: false,
  suppressHeaderMenuButton: true,
  wrapHeaderText: true,
  autoHeaderHeight: true,
  tooltip: true,
};

export type TransactionsGridProps = TransactionActions & {
  rows: TransactionsRow[];
  columnDefs: NonNullable<AgGridReactProps<TransactionsRow>["columnDefs"]>;
  detailColumnDefs: NonNullable<
    AgGridReactProps<TransactionsBookingRow>["columnDefs"]
  >;
  bulkActions?: BulkTransactionActions<TransactionsRow>;
  scopeKey: string;
  navigationTransactionId?: string;
  mutationDialogOpened: boolean;
  resolveScrollTarget: (api: GridApi<TransactionsRow>) => string | undefined;
};

export function TransactionsGrid({
  rows,
  columnDefs,
  detailColumnDefs,
  bulkActions,
  scopeKey,
  navigationTransactionId,
  mutationDialogOpened,
  resolveScrollTarget,
  onEditClick,
  onCopyClick,
  onDeleteClick,
}: TransactionsGridProps) {
  const [inspected, setInspected] = useState<{
    id: string;
    scopeKey: string;
  }>();
  const [api, setApi] = useState<GridApi<TransactionsRow> | null>(null);
  const layoutRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const shouldFocusHeading = useRef(false);
  const returnFocusId = useRef<string | undefined>(undefined);
  const originCell = useRef<
    | {
        id: string;
        columnId: string;
        scopeKey: string;
      }
    | undefined
  >(undefined);
  const columnState = useRef<ColumnState[] | undefined>(undefined);
  const panelId = useId();
  const instructionsId = `${panelId}-instructions`;
  const theme = useMantineTheme();
  const mobile = useMediaQuery(`(max-width: ${theme.breakpoints.sm})`);
  const transaction =
    inspected?.scopeKey === scopeKey
      ? rows.find((row) => row.id === inspected.id)
      : undefined;
  const activeId = transaction?.id;
  const desktopDetails = !!transaction && !mobile;

  const restoreListFocus = useCallback(
    (id?: string) => {
      requestAnimationFrame(() => {
        if (!api || api.isDestroyed()) return;
        const node = id ? api.getRowNode(id) : undefined;
        const origin = originCell.current;
        const columnId =
          origin?.id === id &&
          origin?.scopeKey === scopeKey &&
          api.getColumn(origin.columnId)?.isVisible()
            ? origin.columnId
            : "date";
        if (
          node?.displayed &&
          node.rowIndex != null &&
          api.getColumn(columnId)?.isVisible()
        ) {
          api.ensureNodeVisible(node);
          api.ensureColumnVisible(columnId);
          api.setFocusedCell(node.rowIndex, columnId);
          return;
        }
        const grid =
          layoutRef.current?.querySelector<HTMLElement>('[role="grid"]');
        grid?.setAttribute("tabindex", "-1");
        grid?.focus();
      });
    },
    [api, scopeKey],
  );

  const close = useCallback(() => {
    returnFocusId.current = activeId;
    setInspected(undefined);
    shouldFocusHeading.current = false;
    if (!mobile) restoreListFocus(activeId);
  }, [activeId, mobile, restoreListFocus]);

  const open = useCallback(
    (id: string, focusHeading = false, columnId?: string) => {
      if (columnId) originCell.current = { id, columnId, scopeKey };
      else if (
        originCell.current?.id !== id ||
        originCell.current.scopeKey !== scopeKey
      )
        originCell.current = undefined;
      shouldFocusHeading.current = focusHeading;
      setInspected((previous) =>
        previous?.id === id && previous.scopeKey === scopeKey
          ? previous
          : { id, scopeKey },
      );
      if (focusHeading)
        requestAnimationFrame(() => headingRef.current?.focus());
    },
    [scopeKey],
  );

  function openCellDetails(
    event:
      CellClickedEvent<TransactionsRow> | CellKeyDownEvent<TransactionsRow>,
    focusHeading: boolean,
  ) {
    const columnId = event.column.getColId();
    const target = event.event?.target;
    if (columnId === "ag-Grid-SelectionColumn") return;
    if (
      target instanceof Element &&
      target.closest(
        "a, button, input, select, textarea, [contenteditable='true'], [role='checkbox'], [role='button'], [role='link']",
      )
    )
      return;
    if (event.data) {
      if (focusHeading) event.event?.preventDefault();
      open(event.data.id, focusHeading, columnId);
    }
  }

  // Reconcile against refreshed rows and scope without keeping a stale transaction snapshot.
  useEffect(() => {
    if (inspected && !transaction) {
      setInspected((previous) =>
        previous === inspected ? undefined : previous,
      );
      if (
        document.activeElement === document.body ||
        headingRef.current?.closest("section")?.contains(document.activeElement)
      ) {
        restoreListFocus();
      }
    }
  }, [inspected, transaction, restoreListFocus]);

  useEffect(() => {
    if (!activeId || !api || mobile) return;
    const frame = requestAnimationFrame(() => {
      if (api.isDestroyed()) return;
      const node = api.getRowNode(activeId);
      if (node?.displayed) api.ensureNodeVisible(node);
    });
    return () => cancelAnimationFrame(frame);
  }, [activeId, api, mobile]);

  // Also handle same-page links whose search changes without reloading row data.
  useEffect(() => {
    if (!api || api.isDestroyed() || !navigationTransactionId) return;
    const id = resolveScrollTarget(api);
    if (id && api.getRowNode(id)?.displayed) open(id);
  }, [api, navigationTransactionId, resolveScrollTarget, open]);

  useEffect(() => {
    if (
      activeId &&
      (shouldFocusHeading.current || document.activeElement === document.body)
    ) {
      requestAnimationFrame(() => headingRef.current?.focus());
      shouldFocusHeading.current = false;
    }
  }, [activeId, mobile]);

  const details = transaction ? (
    <BookingDetails
      transaction={transaction}
      columnDefs={detailColumnDefs}
      columnState={columnState}
      headingRef={headingRef}
      panelId={panelId}
      onClose={close}
      onEditClick={onEditClick}
      onCopyClick={onCopyClick}
      onDeleteClick={onDeleteClick}
    />
  ) : null;

  return (
    <Flex
      ref={layoutRef}
      className={classes.layout}
      flex={1}
      direction="column"
      mih={0}
      gap={desktopDetails ? "xs" : 0}
    >
      <VisuallyHidden id={instructionsId}>
        Press Enter on a transaction cell to view details. Press Space to select
        a transaction.
      </VisuallyHidden>
      <VisuallyHidden
        role="status"
        aria-label="Transaction details announcement"
        aria-live="polite"
        aria-atomic="true"
      >
        {transaction
          ? `Details for ${transaction.description || "Untitled transaction"}, ${transaction.bookings.length} bookings`
          : ""}
      </VisuallyHidden>
      <Flex flex={1} direction="column" mih={0} miw={0}>
        <DataGrid
          {...bulkActions?.gridProps}
          className="transactions-master-grid"
          containerStyle={{ flex: 1, minHeight: 0 }}
          rowData={rows}
          columnDefs={columnDefs}
          defaultColDef={DEFAULT_COL_DEF}
          getRowId={({ data }: { data: TransactionsRow }) => data.id}
          ensureDomOrder
          suppressColumnVirtualisation
          rowClassRules={{
            "transaction-inspected": ({ data }) => data?.id === activeId,
          }}
          onGridReady={(event) => {
            event.api.setGridAriaProperty("label", "Transactions");
            event.api.setGridAriaProperty("describedby", instructionsId);
            setApi(event.api);
            bulkActions?.gridProps.onGridReady?.(event);
          }}
          onCellClicked={(event) => openCellDetails(event, false)}
          onCellKeyDown={(event) => {
            if (!("column" in event)) return;
            const key = event.event;
            if (
              !(key instanceof KeyboardEvent) ||
              key.key !== "Enter" ||
              key.altKey ||
              key.ctrlKey ||
              key.metaKey ||
              key.shiftKey ||
              key.repeat ||
              key.isComposing
            )
              return;
            openCellDetails(event, true);
          }}
          onFilterChanged={(event) => {
            bulkActions?.gridProps.onFilterChanged?.(event);
            if (activeId && !event.api.getRowNode(activeId)?.displayed)
              setInspected(undefined);
          }}
          onRowDataUpdated={(event) => {
            bulkActions?.gridProps.onRowDataUpdated?.(event);
            const id = resolveScrollTarget(event.api);
            if (id && event.api.getRowNode(id)?.displayed) open(id);
            else if (activeId && !event.api.getRowNode(activeId)?.displayed)
              setInspected(undefined);
          }}
        />
      </Flex>
      {desktopDetails ? (
        <Flex
          h="min(20rem, 50%)"
          flex="0 0 auto"
          direction="column"
          mih={0}
          miw={0}
        >
          {details}
        </Flex>
      ) : null}
      <Drawer
        opened={!!transaction && !!mobile}
        onClose={close}
        position="bottom"
        size="100%"
        withCloseButton={false}
        trapFocus={!mutationDialogOpened}
        closeOnEscape={!mutationDialogOpened}
        closeOnClickOutside={!mutationDialogOpened}
        attributes={{ content: { "aria-label": "Transaction details" } }}
        classNames={{
          content: classes.drawerContent,
          body: classes.drawerBody,
        }}
        returnFocus={false}
        onExitTransitionEnd={() => {
          if (!transaction) restoreListFocus(returnFocusId.current);
        }}
      >
        {mobile ? details : null}
      </Drawer>
    </Flex>
  );
}
