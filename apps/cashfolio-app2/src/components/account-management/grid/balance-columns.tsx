import { GridCellLoading } from "@/components/grid/grid-cell-loading";
import { type ColDef, type ICellRendererParams } from "ag-grid-enterprise";
import { FORMATTED_NUMERIC_COLUMN } from "@/components/grid/column-types";
import { getCurrencyDecimals } from "@/shared/units/unit-format";
import type { GroupBalanceAggregation } from "./reference-balance-aggregation";
import {
  isReferenceCurrencyTotalFooterRow,
  type AccountsGridRow,
} from "./rows";
import { shouldShowReferenceBalanceLoadingIndicator } from "../loading/reference-balance-loading";
import type { RefObject } from "react";
import type { AccountSetFilters } from "./use-set-filters";
import {
  getAccountListUnitIdentifierDisplayValue,
  getAccountListBalanceValue,
} from "./column-values";

type BalanceColumnOptions = {
  unitFilter: AccountSetFilters["unitIdentifier"];
  referenceCurrency: string;
  isReferenceBalancesLoadingRef: RefObject<boolean>;
  balanceInReferenceCurrencyByGroupIdRef: RefObject<
    Map<string, GroupBalanceAggregation>
  >;
};
function buildUnitColumn({
  referenceCurrency,
  unitFilter,
}: BalanceColumnOptions): ColDef<AccountsGridRow> {
  return {
    colId: "unitIdentifier",
    headerName: "Ccy./Symbol",
    ...unitFilter,
    initialWidth: 180,
    resizable: true,
    valueGetter: ({ data }) =>
      getAccountListUnitIdentifierDisplayValue({ data, referenceCurrency }),
  };
}
function buildBalanceColumn(
  referenceCurrency: string,
): ColDef<AccountsGridRow> {
  return {
    field: "balance",
    headerName: "Balance",
    width: 130,
    type: FORMATTED_NUMERIC_COLUMN,
    filter: "agNumberColumnFilter",
    valueGetter: ({ data }) =>
      getAccountListBalanceValue({ data, referenceCurrency }),
  };
}
function renderReferenceBalance(
  {
    data,
    value,
    formatValue,
  }: ICellRendererParams<AccountsGridRow, number | null>,
  options: BalanceColumnOptions,
) {
  if (!data) return null;
  if (
    shouldShowReferenceBalanceLoadingIndicator({
      data,
      isReferenceBalancesLoading: options.isReferenceBalancesLoadingRef.current,
      balanceInReferenceCurrencyByGroupId:
        options.balanceInReferenceCurrencyByGroupIdRef.current,
    })
  ) {
    return <GridCellLoading label="Loading reference balance" />;
  }
  if (value == null) return null;
  return formatValue?.(value) ?? value.toString();
}
function buildReferenceBalanceColumn(
  options: BalanceColumnOptions,
): ColDef<AccountsGridRow> {
  const decimals = getCurrencyDecimals(options.referenceCurrency);
  return {
    field: "balanceInReferenceCurrency",
    headerName: `Balance (${options.referenceCurrency})`,
    width: 170,
    type: FORMATTED_NUMERIC_COLUMN,
    context: { formattedNumeric: { getDisplayDecimals: () => decimals } },
    filter: "agNumberColumnFilter",
    valueGetter: ({ data }) => {
      if (!data) return null;
      if (isReferenceCurrencyTotalFooterRow(data))
        return data.balanceInReferenceCurrency;
      return data.balanceInReferenceCurrency;
    },
    cellRenderer: (
      params: ICellRendererParams<AccountsGridRow, number | null>,
    ) => renderReferenceBalance(params, options),
  };
}
export function buildAccountBalanceColumns(
  options: BalanceColumnOptions,
): ColDef<AccountsGridRow>[] {
  return [
    buildUnitColumn(options),
    buildBalanceColumn(options.referenceCurrency),
    buildReferenceBalanceColumn(options),
  ];
}
