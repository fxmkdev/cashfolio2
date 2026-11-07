import { useMemo, useRef } from "react";
import type { ColDef } from "ag-grid-enterprise";
import { createSetFilterParams } from "@/components/grid/set-filter";
import type {
  AccountFilterContext,
  AccountFilterDimension,
} from "./account-filter-context";
import {
  isReferenceCurrencyTotalFooterRow,
  type AccountsGridRow,
} from "./page-types";

type FilterColumn = Pick<
  ColDef<AccountsGridRow>,
  "filter" | "filterParams" | "filterValueGetter"
>;

export function useAccountSetFilters(context: AccountFilterContext) {
  const contextRef = useRef(context);
  contextRef.current = context;
  return useMemo(() => {
    const column = (dimension: AccountFilterDimension): FilterColumn => ({
      filter: "agSetColumnFilter",
      filterParams: createSetFilterParams<AccountsGridRow>(
        () => contextRef.current[dimension].options,
        dimension === "assetClass" || dimension === "path",
      ),
      filterValueGetter: ({ data }) =>
        !data ||
        isReferenceCurrencyTotalFooterRow(data) ||
        data.nodeType !== "account"
          ? []
          : (contextRef.current[dimension].valuesByAccountId.get(data.id) ??
            []),
    });
    return {
      unitIdentifier: column("unitIdentifier"),
      assetClass: column("assetClass"),
      path: column("path"),
      trackingMethod: column("trackingMethod"),
    };
  }, []);
}

export type AccountSetFilters = ReturnType<typeof useAccountSetFilters>;
