import { Button, Tooltip } from "@mantine/core";
import { GridCellLoading } from "@/components/grid/grid-cell-loading";
import type { ColGroupDef, ICellRendererParams } from "ag-grid-enterprise";
import type {
  AccountReturnSummaries,
  AccountReturnTarget,
} from "@/shared/accounts/account-returns";
import { accountReturnExplanation } from "@/shared/accounts/account-returns";
import { rowActionsColumnProps } from "@/components/grid/row-actions-menu";
import {
  isReferenceCurrencyTotalFooterRow,
  type AccountsGridRow,
} from "../grid/rows";

export function buildAccountReturnColumns(args: {
  data?: AccountReturnSummaries;
  loading?: boolean;
  completedIds?: Set<string>;
  locale: string;
  onOpen?: (target: AccountReturnTarget) => void;
}): ColGroupDef<AccountsGridRow> {
  const byId = new Map(args.data?.rows.map((row) => [row.id, row]));
  const resultFor = (row: AccountsGridRow | undefined) =>
    row
      ? isReferenceCurrencyTotalFooterRow(row)
        ? args.data?.total
        : byId.get(row.id)
      : undefined;
  const formatter = new Intl.NumberFormat(args.locale, {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return {
    groupId: "account-returns",
    headerName: "Returns Since Start",
    marryChildren: true,
    children: (["twr", "mwr"] as const).map((metric) => ({
      colId: `return-${metric}`,
      headerName: metric.toUpperCase(),
      width: 130,
      type: "numericColumn",
      cellRendererParams: rowActionsColumnProps.cellRendererParams,
      suppressKeyboardEvent: rowActionsColumnProps.suppressKeyboardEvent,
      valueGetter: ({ data }) => resultFor(data)?.[metric] ?? null,
      valueFormatter: ({ value }) =>
        value == null ? "—" : formatter.format(value),
      tooltip: ({ data }) => accountReturnExplanation(resultFor(data), metric),
      cellRenderer: ({
        data,
        valueFormatted,
      }: ICellRendererParams<AccountsGridRow>) => {
        const id =
          data && isReferenceCurrencyTotalFooterRow(data)
            ? "__return_total__"
            : data?.id;
        if (args.loading && (!id || !args.completedIds?.has(id)))
          return <GridCellLoading label={`Loading ${metric.toUpperCase()}`} />;
        const result = resultFor(data);
        if (!data || !result?.applicable) return "—";
        const value = result[metric];
        return (
          <Tooltip
            label={accountReturnExplanation(result, metric)}
            multiline
            w={320}
            events={{ hover: true, focus: true, touch: false }}
          >
            <Button
              variant="transparent"
              size="compact-sm"
              color={
                value == null || value === 0
                  ? "gray"
                  : value > 0
                    ? "green"
                    : "red"
              }
              aria-label={`View ${metric.toUpperCase()} calculation for ${data.name}: ${value == null ? accountReturnExplanation(result, metric) : formatter.format(value)}`}
              onClick={(event) => {
                event.stopPropagation();
                args.onOpen?.(
                  isReferenceCurrencyTotalFooterRow(data)
                    ? { kind: "total" }
                    : {
                        kind: data.nodeType === "account" ? "account" : "group",
                        id: data.id,
                      },
                );
              }}
            >
              {valueFormatted ?? "—"}
            </Button>
          </Tooltip>
        );
      },
    })),
  };
}
