import { useAssetClasses } from "@/classification-context";
import { buildAccountGainLossColumns } from "./-gain-loss-columns";
import { useMemo, useRef } from "react";
import { type ColDef, type ColGroupDef } from "ag-grid-enterprise";
import { type AccountsGridRow } from "./-page-types";
import type { AccountTreeColumnParams } from "./-account-column-types";
import { buildAccountBalanceColumns } from "./-balance-columns";
import { buildAccountMetadataColumns } from "./-metadata-columns";
import { buildAccountActionsColumn } from "./-account-actions-column";
export {
  getAccountListAssetClassValue,
  getAccountListPathValue,
  getAccountListTrackingMethodValue,
  getAccountListUnitIdentifierDisplayValue,
  getAccountListBalanceValue,
} from "./-account-column-values";
export function useAccountTreeColumnDefs(
  params: AccountTreeColumnParams,
): (ColDef<AccountsGridRow> | ColGroupDef<AccountsGridRow>)[] {
  const assetClasses = useAssetClasses();
  const {
    grouping = "accountStructure",
    gainLossData,
    isGainLossLoading,
    isEquityTab,
    categoryType,
    rowsByParentKey,
    referenceCurrency,
    isReferenceBalancesLoading,
    balanceInReferenceCurrencyByGroupId,
    onEditRow,
    onAddChild,
    onUnarchiveRow,
    unarchivePending,
    onArchiveRow,
    onDeleteRow,
    onReorderRow,
  } = params;
  const rowsByParentKeyRef = useRef(rowsByParentKey);
  rowsByParentKeyRef.current = rowsByParentKey;
  const isReferenceBalancesLoadingRef = useRef(isReferenceBalancesLoading);
  isReferenceBalancesLoadingRef.current = isReferenceBalancesLoading;
  const balanceInReferenceCurrencyByGroupIdRef = useRef(
    balanceInReferenceCurrencyByGroupId,
  );
  balanceInReferenceCurrencyByGroupIdRef.current =
    balanceInReferenceCurrencyByGroupId;

  return useMemo<(ColDef<AccountsGridRow> | ColGroupDef<AccountsGridRow>)[]>(
    () => [
      ...(!isEquityTab
        ? [
            ...buildAccountBalanceColumns({
              referenceCurrency,
              isReferenceBalancesLoadingRef,
              balanceInReferenceCurrencyByGroupIdRef,
            }),
            ...buildAccountMetadataColumns({ grouping, assetClasses }),
            buildAccountGainLossColumns({
              referenceCurrency,
              data: gainLossData,
              loading: isGainLossLoading ?? false,
            }),
          ]
        : []),
      buildAccountActionsColumn(
        {
          grouping,
          isEquityTab,
          categoryType,
          onEditRow,
          onAddChild,
          onUnarchiveRow,
          unarchivePending,
          onArchiveRow,
          onDeleteRow,
          onReorderRow,
        },
        rowsByParentKeyRef,
      ),
    ],
    [
      grouping,
      assetClasses,
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
      onReorderRow,
    ],
  );
}
