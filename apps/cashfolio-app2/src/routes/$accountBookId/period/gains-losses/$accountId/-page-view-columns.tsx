import { ActionIcon, Badge, Group, Tooltip } from "@mantine/core";
import { IconTable } from "@tabler/icons-react";
import type { ColDef, ICellRendererParams } from "ag-grid-enterprise";
import {
  DATE_COLUMN,
  FORMATTED_NUMERIC_COLUMN,
} from "@/components/column-types";
import {
  formatDateLabel,
  formatDescription,
  getGridUserLocale,
  getLedgerActionTooltipLabel,
  toEventSide,
} from "./-page-view-formatters";
import type {
  DiagnosticRow,
  OpenLotRow,
  RealizedEventLotMatchRow,
  RealizedEventRow,
} from "./-page-view-types";

export function buildRealizedColumns(args: {
  isVirtualTarget: boolean;
  quantityDisplayDecimals: number;
  referenceCurrencyDisplayDecimals: number;
  unitPriceDisplayDecimals: number;
  onOpenEventTransaction: (transactionId: string) => void;
}): ColDef<RealizedEventRow>[] {
  return [
    {
      headerName: "Side",
      colId: "side",
      width: 110,
      cellRenderer: ({ data }: ICellRendererParams<RealizedEventRow>) => {
        if (!data) {
          return "—";
        }
        const side = toEventSide(data);
        if (side === "flat") {
          return <Badge variant="light">Flat</Badge>;
        }
        return (
          <Badge color={side === "buy" ? "green" : "red"} variant="light">
            {side === "buy" ? "Buy" : "Sell"}
          </Badge>
        );
      },
    },
    {
      headerName: "Date",
      field: "date",
      width: 140,
      type: DATE_COLUMN,
      valueFormatter: ({ context, value }) =>
        formatDateLabel(value, getGridUserLocale(context)),
    },
    {
      headerName: "Transaction",
      field: "transactionDescription",
      minWidth: 220,
      flex: 1,
      valueFormatter: ({ value }) => formatDescription(value),
    },
    {
      headerName: "Quantity",
      field: "quantity",
      width: 140,
      type: FORMATTED_NUMERIC_COLUMN,
      context: {
        formattedNumeric: {
          getDisplayDecimals: () => args.quantityDisplayDecimals,
        },
      },
    },
    {
      headerName: "Effective Amount",
      field: "effectiveReferenceAmount",
      width: 180,
      type: FORMATTED_NUMERIC_COLUMN,
      context: {
        formattedNumeric: {
          getDisplayDecimals: () => args.referenceCurrencyDisplayDecimals,
        },
      },
    },
    {
      headerName: "Exec. Price",
      field: "executionUnitPriceInReference",
      width: 150,
      type: FORMATTED_NUMERIC_COLUMN,
      context: {
        formattedNumeric: {
          getDisplayDecimals: () => args.unitPriceDisplayDecimals,
        },
      },
    },
    {
      headerName: "Realised Delta",
      field: "realizedGainLossDelta",
      width: 160,
      type: FORMATTED_NUMERIC_COLUMN,
      context: {
        formattedNumeric: {
          getDisplayDecimals: () => args.referenceCurrencyDisplayDecimals,
        },
      },
    },
    {
      headerName: "Running Realised",
      field: "runningRealizedGainLoss",
      width: 180,
      type: FORMATTED_NUMERIC_COLUMN,
      context: {
        formattedNumeric: {
          getDisplayDecimals: () => args.referenceCurrencyDisplayDecimals,
        },
      },
    },
    {
      colId: "actions",
      headerName: "",
      width: 84,
      pinned: "right",
      sortable: false,
      filter: false,
      resizable: false,
      suppressHeaderMenuButton: true,
      cellClass: "actions-cell",
      cellRenderer: ({ data }: ICellRendererParams<RealizedEventRow>) => {
        if (!data) {
          return null;
        }
        const canOpenLedger = !!data.transactionId && !args.isVirtualTarget;
        const tooltipLabel = getLedgerActionTooltipLabel({
          canOpenLedger,
          isVirtualTarget: args.isVirtualTarget,
        });
        return (
          <Group gap={4} wrap="nowrap" h="100%" align="center">
            <Tooltip label={tooltipLabel}>
              <span style={{ display: "inline-flex" }}>
                <ActionIcon
                  variant="subtle"
                  size="sm"
                  disabled={!canOpenLedger}
                  aria-label={tooltipLabel}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (!canOpenLedger || !data.transactionId) {
                      return;
                    }
                    args.onOpenEventTransaction(data.transactionId);
                  }}
                  onDoubleClick={(event) => {
                    event.stopPropagation();
                  }}
                >
                  <IconTable size={16} />
                </ActionIcon>
              </span>
            </Tooltip>
          </Group>
        );
      },
    },
  ];
}

export function buildRealizedLotMatchColumns(args: {
  quantityDisplayDecimals: number;
  referenceCurrencyDisplayDecimals: number;
  unitPriceDisplayDecimals: number;
}): ColDef<RealizedEventLotMatchRow>[] {
  return [
    {
      headerName: "Acquired",
      field: "acquisitionDate",
      width: 140,
      type: DATE_COLUMN,
      valueFormatter: ({ context, value }) =>
        formatDateLabel(value, getGridUserLocale(context)),
    },
    {
      headerName: "Matched Qty",
      field: "matchedQuantity",
      width: 140,
      type: FORMATTED_NUMERIC_COLUMN,
      context: {
        formattedNumeric: {
          getDisplayDecimals: () => args.quantityDisplayDecimals,
        },
      },
    },
    {
      headerName: "Lot Unit Cost",
      field: "lotUnitCostInReference",
      width: 160,
      type: FORMATTED_NUMERIC_COLUMN,
      context: {
        formattedNumeric: {
          getDisplayDecimals: () => args.unitPriceDisplayDecimals,
        },
      },
    },
    {
      headerName: "Execution Price",
      field: "executionUnitPriceInReference",
      width: 160,
      type: FORMATTED_NUMERIC_COLUMN,
      context: {
        formattedNumeric: {
          getDisplayDecimals: () => args.unitPriceDisplayDecimals,
        },
      },
    },
    {
      headerName: "Lot Delta",
      field: "realizedGainLossDelta",
      width: 140,
      type: FORMATTED_NUMERIC_COLUMN,
      context: {
        formattedNumeric: {
          getDisplayDecimals: () => args.referenceCurrencyDisplayDecimals,
        },
      },
    },
    {
      headerName: "Running Event Realised",
      field: "runningEventRealizedGainLoss",
      width: 190,
      type: FORMATTED_NUMERIC_COLUMN,
      context: {
        formattedNumeric: {
          getDisplayDecimals: () => args.referenceCurrencyDisplayDecimals,
        },
      },
    },
  ];
}

export function buildOpenLotColumns(args: {
  quantityDisplayDecimals: number;
  referenceCurrencyDisplayDecimals: number;
  unitPriceDisplayDecimals: number;
}): ColDef<OpenLotRow>[] {
  return [
    {
      headerName: "Acquired",
      field: "acquisitionDate",
      width: 140,
      type: DATE_COLUMN,
      valueFormatter: ({ context, value }) =>
        formatDateLabel(value, getGridUserLocale(context)),
    },
    {
      headerName: "Quantity",
      field: "quantity",
      width: 140,
      type: FORMATTED_NUMERIC_COLUMN,
      context: {
        formattedNumeric: {
          getDisplayDecimals: () => args.quantityDisplayDecimals,
        },
      },
    },
    {
      headerName: "Unit Cost",
      field: "unitCostInReference",
      width: 150,
      type: FORMATTED_NUMERIC_COLUMN,
      context: {
        formattedNumeric: {
          getDisplayDecimals: () => args.unitPriceDisplayDecimals,
        },
      },
    },
    {
      headerName: "Period-End Rate",
      field: "periodEndRate",
      width: 160,
      type: FORMATTED_NUMERIC_COLUMN,
      context: {
        formattedNumeric: {
          getDisplayDecimals: () => args.unitPriceDisplayDecimals,
        },
      },
    },
    {
      headerName: "Unrealised",
      field: "unrealizedGainLoss",
      width: 160,
      type: FORMATTED_NUMERIC_COLUMN,
      context: {
        formattedNumeric: {
          getDisplayDecimals: () => args.referenceCurrencyDisplayDecimals,
        },
      },
    },
    {
      headerName: "Running Unrealised",
      field: "runningUnrealizedGainLoss",
      width: 190,
      type: FORMATTED_NUMERIC_COLUMN,
      context: {
        formattedNumeric: {
          getDisplayDecimals: () => args.referenceCurrencyDisplayDecimals,
        },
      },
    },
  ];
}

export const DIAGNOSTICS_COLUMNS: ColDef<DiagnosticRow>[] = [
  {
    headerName: "Date",
    field: "date",
    width: 140,
    type: DATE_COLUMN,
    valueFormatter: ({ context, value }) =>
      formatDateLabel(value, getGridUserLocale(context)),
  },
  {
    headerName: "Reason",
    field: "reason",
    width: 180,
  },
  {
    headerName: "Message",
    field: "message",
    flex: 1,
  },
  {
    headerName: "Booking",
    field: "bookingDescription",
    minWidth: 220,
    valueFormatter: ({ value }) => formatDescription(value),
  },
  {
    headerName: "Transaction",
    field: "transactionDescription",
    minWidth: 220,
    valueFormatter: ({ value }) => formatDescription(value),
  },
];
