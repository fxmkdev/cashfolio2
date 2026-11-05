import { Loader } from "@mantine/core";
import { type ColDef, type ICellRendererParams } from "ag-grid-enterprise";
import { FORMATTED_NUMERIC_COLUMN } from "@/components/grid/column-types";
import { getCurrencyDecimals } from "@/shared/unit-format";
import type { GroupBalanceAggregation } from "./-page-data";
import {
  isReferenceCurrencyTotalFooterRow,
  type AccountsGridRow,
} from "./-page-types";
import { shouldShowReferenceBalanceLoadingIndicator } from "./-reference-balance-loading";
import type { RefObject } from "react";
import {
  getAccountListUnitIdentifierDisplayValue,
  getAccountListBalanceValue,
} from "./-account-column-values";
export function buildAccountBalanceColumns({
  referenceCurrency,
  isReferenceBalancesLoadingRef,
  balanceInReferenceCurrencyByGroupIdRef,
}: {
  referenceCurrency: string;
  isReferenceBalancesLoadingRef: RefObject<boolean>;
  balanceInReferenceCurrencyByGroupIdRef: RefObject<
    Map<string, GroupBalanceAggregation>
  >;
}): ColDef<AccountsGridRow>[] {
  const referenceCurrencyDisplayDecimals =
    getCurrencyDecimals(referenceCurrency);
  return [
    {
      colId: "unitIdentifier",
      headerName: "Ccy./Symbol",
      filter: "agTextColumnFilter",
      initialWidth: 180,
      resizable: true,
      valueGetter: ({ data }: { data: AccountsGridRow | undefined }) => {
        return getAccountListUnitIdentifierDisplayValue({
          data,
          referenceCurrency,
        });
      },
    } satisfies ColDef<AccountsGridRow>,
    {
      field: "balance",
      headerName: "Balance",
      width: 130,
      type: FORMATTED_NUMERIC_COLUMN,
      filter: "agNumberColumnFilter",
      valueGetter: ({ data }: { data: AccountsGridRow | undefined }) => {
        return getAccountListBalanceValue({
          data,
          referenceCurrency,
        });
      },
    } satisfies ColDef<AccountsGridRow>,
    {
      field: "balanceInReferenceCurrency",
      headerName: `Balance (${referenceCurrency})`,
      width: 170,
      type: FORMATTED_NUMERIC_COLUMN,
      context: {
        formattedNumeric: {
          getDisplayDecimals: () => referenceCurrencyDisplayDecimals,
        },
      },
      filter: "agNumberColumnFilter",
      valueGetter: ({ data }: { data: AccountsGridRow | undefined }) => {
        if (!data) return null;
        if (isReferenceCurrencyTotalFooterRow(data)) {
          return data.balanceInReferenceCurrency;
        }
        return data.balanceInReferenceCurrency;
      },
      cellRenderer: ({
        data,
        value,
        formatValue,
      }: ICellRendererParams<AccountsGridRow, number | null>) => {
        if (!data) return null;

        if (
          shouldShowReferenceBalanceLoadingIndicator({
            data,
            isReferenceBalancesLoading: isReferenceBalancesLoadingRef.current,
            balanceInReferenceCurrencyByGroupId:
              balanceInReferenceCurrencyByGroupIdRef.current,
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
      },
    } satisfies ColDef<AccountsGridRow>,
  ];
}
