import { Button } from "@mantine/core";
import { GridCellLoading } from "@/components/grid/grid-cell-loading";
import type { ColDef, ICellRendererParams } from "ag-grid-enterprise";
import type {
  AccountReturnBasis,
  AccountReturnSummaries,
  AccountReturnTarget,
} from "@/shared/accounts/account-returns";
import {
  accountReturnBasisLabels,
  getAccountReturnDisplay,
} from "@/shared/accounts/account-return-display";
import { rowActionsColumnProps } from "@/components/grid/row-actions-menu";
import {
  isReferenceCurrencyTotalFooterRow,
  type AccountsGridRow,
} from "../grid/rows";

export function buildAccountReturnColumn(args: {
  basis?: AccountReturnBasis;
  data?: AccountReturnSummaries;
  loading?: boolean;
  completedIds?: Set<string>;
  locale: string;
  onOpen?: (target: AccountReturnTarget) => void;
}): ColDef<AccountsGridRow> {
  const basis = args.basis ?? "annualized";
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
    colId: "account-return",
    headerName: `Return (${accountReturnBasisLabels[basis]})`,
    initialWidth: 180,
    type: "numericColumn",
    cellRendererParams: rowActionsColumnProps.cellRendererParams,
    suppressKeyboardEvent: rowActionsColumnProps.suppressKeyboardEvent,
    valueGetter: ({ data }) =>
      getAccountReturnDisplay(resultFor(data), basis).value,
    valueFormatter: ({ value }) =>
      value == null ? "—" : formatter.format(value),
    tooltip: ({ data }) =>
      getAccountReturnDisplay(resultFor(data), basis).explanation,
    cellRenderer: ({
      data,
      valueFormatted,
    }: ICellRendererParams<AccountsGridRow>) => {
      const id =
        data && isReferenceCurrencyTotalFooterRow(data)
          ? "__return_total__"
          : data?.id;
      if (args.loading && (!id || !args.completedIds?.has(id)))
        return <GridCellLoading label="Loading return" />;
      const result = resultFor(data);
      if (!data || !result?.applicable) return "—";
      const { value, explanation } = getAccountReturnDisplay(result, basis);
      return (
        <Button
          variant="transparent"
          size="compact-sm"
          color={
            value == null || value === 0 ? "gray" : value > 0 ? "green" : "red"
          }
          aria-label={`View Return Calculation for ${data.name} (${accountReturnBasisLabels[basis]}): ${value == null ? explanation : formatter.format(value)}`}
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
      );
    },
  };
}
