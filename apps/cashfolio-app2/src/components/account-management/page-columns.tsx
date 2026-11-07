import { useAssetClasses } from "@/classification-context";
import { buildAccountGainLossColumns } from "./gain-loss-columns";
import { useMemo, useRef } from "react";
import { type ColDef, type ColGroupDef } from "ag-grid-enterprise";
import { type AccountsGridRow } from "./page-types";
import type { AccountTreeColumnParams } from "./account-column-types";
import { buildAccountBalanceColumns } from "./balance-columns";
import { buildAccountMetadataColumns } from "./metadata-columns";
import { buildAccountActionsColumn } from "./account-actions-column";
export {
  getAccountListAssetClassValue,
  getAccountListPathValue,
  getAccountListTrackingMethodValue,
  getAccountListUnitIdentifierDisplayValue,
  getAccountListBalanceValue,
} from "./account-column-values";

type ColumnDefs = (ColDef<AccountsGridRow> | ColGroupDef<AccountsGridRow>)[];
type AssetClasses = ReturnType<typeof useAssetClasses>;
type ColumnRefs = ReturnType<typeof useReferenceBalanceColumnRefs>;
type ColumnOptions = Omit<
  AccountTreeColumnParams,
  | "rowsByParentKey"
  | "isReferenceBalancesLoading"
  | "balanceInReferenceCurrencyByGroupId"
>;
function useReferenceBalanceColumnRefs(params: AccountTreeColumnParams) {
  const isReferenceBalancesLoadingRef = useRef(
    params.isReferenceBalancesLoading,
  );
  isReferenceBalancesLoadingRef.current = params.isReferenceBalancesLoading;
  const balanceInReferenceCurrencyByGroupIdRef = useRef(
    params.balanceInReferenceCurrencyByGroupId,
  );
  balanceInReferenceCurrencyByGroupIdRef.current =
    params.balanceInReferenceCurrencyByGroupId;
  return {
    isReferenceBalancesLoadingRef,
    balanceInReferenceCurrencyByGroupIdRef,
  };
}
function buildAccountTreeColumns(
  params: ColumnOptions,
  assetClasses: AssetClasses,
  refs: ColumnRefs,
): ColumnDefs {
  const {
    isEquityTab,
    referenceCurrency,
    gainLossData,
    isGainLossLoading,
    grouping = "accountStructure",
  } = params;
  return [
    ...(!isEquityTab
      ? [
          ...buildAccountBalanceColumns({ referenceCurrency, ...refs }),
          buildAccountGainLossColumns({
            referenceCurrency,
            data: gainLossData,
            loading: isGainLossLoading ?? false,
          }),
          ...buildAccountMetadataColumns({ grouping, assetClasses }),
        ]
      : []),
    buildAccountActionsColumn(params),
  ];
}
function useAccountColumnOptions(params: AccountTreeColumnParams) {
  const {
    grouping = "accountStructure",
    gainLossData,
    isGainLossLoading,
    isEquityTab,
    categoryType,
    referenceCurrency,
    onEditRow,
    onAddChild,
    onUnarchiveRow,
    unarchivePending,
    onArchiveRow,
    onDeleteRow,
  } = params;
  return useMemo(
    () => ({
      grouping,
      gainLossData,
      isGainLossLoading,
      isEquityTab,
      categoryType,
      referenceCurrency,
      onEditRow,
      onAddChild,
      onUnarchiveRow,
      unarchivePending,
      onArchiveRow,
      onDeleteRow,
    }),
    [
      grouping,
      gainLossData,
      isGainLossLoading,
      isEquityTab,
      categoryType,
      referenceCurrency,
      onEditRow,
      onAddChild,
      onUnarchiveRow,
      unarchivePending,
      onArchiveRow,
      onDeleteRow,
    ],
  );
}

export function useAccountTreeColumnDefs(
  params: AccountTreeColumnParams,
): ColumnDefs {
  const assetClasses = useAssetClasses();
  const {
    isReferenceBalancesLoadingRef,
    balanceInReferenceCurrencyByGroupIdRef,
  } = useReferenceBalanceColumnRefs(params);
  const options = useAccountColumnOptions(params);
  return useMemo(
    () =>
      buildAccountTreeColumns(options, assetClasses, {
        isReferenceBalancesLoadingRef,
        balanceInReferenceCurrencyByGroupIdRef,
      }),
    [
      options,
      assetClasses,
      isReferenceBalancesLoadingRef,
      balanceInReferenceCurrencyByGroupIdRef,
    ],
  );
}
