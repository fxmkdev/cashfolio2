import { Button, Modal, Stack, Text } from "@mantine/core";
import { useMemo } from "react";
import type { ColDef, ICellRendererParams } from "ag-grid-enterprise";
import { DataGrid } from "@/components/grid/data-grid";
import { FORMATTED_NUMERIC_COLUMN } from "@/components/grid/column-types";
import type { PeriodBreakdownChartDatum } from "./-breakdown-chart-options";
import {
  getAllocationOtherAction,
  isAllocationActionKey,
} from "./-allocation-other-actions";

export function AllocationOtherDialog({
  opened,
  onClose,
  rows,
  subtotal,
  onRowOpen,
}: {
  opened: boolean;
  onClose: () => void;
  rows: PeriodBreakdownChartDatum[];
  subtotal: PeriodBreakdownChartDatum;
  onRowOpen: (datum: PeriodBreakdownChartDatum) => void;
}) {
  const columnDefs = useMemo<ColDef<PeriodBreakdownChartDatum>[]>(
    () => [
      {
        field: "label",
        headerName: "Name",
        flex: 1,
        minWidth: 160,
        wrapText: true,
        autoHeight: true,
        tooltip: ({ data }) => data?.label ?? "",
      },
      {
        field: "amount",
        headerName: "Amount",
        width: 160,
        type: FORMATTED_NUMERIC_COLUMN,
        valueFormatter: ({ data }) => data?.amountLabel ?? "",
      },
      {
        field: "percentage",
        headerName: "Share",
        width: 110,
        type: FORMATTED_NUMERIC_COLUMN,
        valueFormatter: ({ data }) => data?.percentageLabel ?? "",
      },
      {
        colId: "actions",
        headerName: "Actions",
        width: 130,
        suppressKeyboardEvent: ({ event }) => isAllocationActionKey(event),
        cellRenderer: ({
          data,
          node,
        }: ICellRendererParams<PeriodBreakdownChartDatum>) => {
          if (!data || node.rowPinned) return null;
          const label = getAllocationOtherAction(data);
          if (!label) return null;
          return (
            <Button
              variant="subtle"
              size="compact-xs"
              aria-label={`${label}: ${data.label}`}
              tabIndex={-1}
              onClick={(event) => {
                event.stopPropagation();
                onRowOpen(data);
              }}
              onDoubleClick={(event) => event.stopPropagation()}
            >
              {label}
            </Button>
          );
        },
      },
    ],
    [onRowOpen],
  );
  const subtotalRows = useMemo(
    () => [{ ...subtotal, label: "Subtotal" }],
    [subtotal],
  );
  return (
    <Modal opened={opened} onClose={onClose} title="Other Allocation" size="xl">
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          Shares are percentages of the allocation total at the current chart
          level, including categories outside Other. Double-click a group to
          drill down or an eligible account to open its ledger. Use Tab or arrow
          keys to reach Actions, then press Enter or Space.
        </Text>
        <DataGrid
          containerStyle={{ height: 360 }}
          rowData={rows}
          columnDefs={columnDefs}
          pinnedBottomRowData={subtotalRows}
          defaultColDef={{ sortable: false, suppressHeaderMenuButton: true }}
          getRowId={({ data }) => data.id}
          onCellKeyDown={(event) => {
            const key = event.event;
            if (
              !("column" in event) ||
              event.column.getColId() !== "actions" ||
              !(key instanceof KeyboardEvent) ||
              !isAllocationActionKey(key)
            )
              return;
            key.preventDefault();
            if (
              !key.repeat &&
              !key.isComposing &&
              event.data &&
              !event.node.rowPinned &&
              getAllocationOtherAction(event.data)
            ) {
              onRowOpen(event.data);
            }
          }}
          onRowDoubleClicked={({ data, node }) => {
            if (data && !node.rowPinned && getAllocationOtherAction(data))
              onRowOpen(data);
          }}
        />
        <Button variant="default" onClick={onClose}>
          Close
        </Button>
      </Stack>
    </Modal>
  );
}
