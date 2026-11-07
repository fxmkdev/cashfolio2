import { Loader } from "@mantine/core";
import { type ColDef, type ICellRendererParams } from "ag-grid-enterprise";
import { FORMATTED_NUMERIC_COLUMN } from "@/components/grid/column-types";
import { getCurrencyDecimals } from "@/shared/unit-format";
import type { GroupBalanceAggregation } from "./page-data";
import {
  isReferenceCurrencyTotalFooterRow,
  type AccountsGridRow,
} from "./page-types";
import { shouldShowReferenceBalanceLoadingIndicator } from "./reference-balance-loading";
import type { RefObject } from "react";
import {
  getAccountListUnitIdentifierDisplayValue,
  getAccountListBalanceValue,
} from "./account-column-values";

type BalanceColumnOptions = {
  referenceCurrency: string;
  isReferenceBalancesLoadingRef: RefObject<boolean>;
  balanceInReferenceCurrencyByGroupIdRef: RefObject<
    Map<string, GroupBalanceAggregation>
  >;
};
function buildUnitColumn(referenceCurrency: string): ColDef<AccountsGridRow> {
  return {
    colId: "unitIdentifier",
    headerName: "Ccy./Symbol",
    filter: "agTextColumnFilter",
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
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
        }}
      >
        <Loader type="dots" size="xs" />
      </div>
    );
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
    buildUnitColumn(options.referenceCurrency),
    buildBalanceColumn(options.referenceCurrency),
    buildReferenceBalanceColumn(options),
  ];
}
