import { useAssetClasses } from "@/classification-context";
import { buildAccountGainLossColumns } from "../gain-loss/columns";
import { buildAccountReturnColumns } from "../return-columns";
import { useUserLocale } from "@/user-locale-context";
import { useMemo, useRef } from "react";
import { type ColDef, type ColGroupDef } from "ag-grid-enterprise";
import { type AccountsGridRow } from "./rows";
import type { AccountTreeColumnParams } from "./column-types";
import { buildAccountBalanceColumns } from "./balance-columns";
import { buildAccountMetadataColumns } from "./metadata-columns";
import { buildAccountActionsColumn } from "./actions-column";
import { useAccountSetFilters } from "./use-set-filters";

type ColumnDefs = (ColDef<AccountsGridRow> | ColGroupDef<AccountsGridRow>)[];
type ColumnOptions = Omit<
  AccountTreeColumnParams,
  | "rowsByParentKey"
  | "isReferenceBalancesLoading"
  | "balanceInReferenceCurrencyByGroupId"
  | "filterContext"
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
  return useMemo(
    () => ({
      isReferenceBalancesLoadingRef,
      balanceInReferenceCurrencyByGroupIdRef,
    }),
    [isReferenceBalancesLoadingRef, balanceInReferenceCurrencyByGroupIdRef],
  );
}
function buildAccountTreeColumns(
  params: ColumnOptions,
  balanceColumns: ColDef<AccountsGridRow>[],
  metadataColumns: ColDef<AccountsGridRow>[],
  locale: string,
): ColumnDefs {
  const { isEquityTab, referenceCurrency, gainLossData, isGainLossLoading } =
    params;
  return [
    ...(!isEquityTab
      ? [
          ...balanceColumns,
          buildAccountGainLossColumns({
            referenceCurrency,
            data: gainLossData,
            loading: isGainLossLoading ?? false,
          }),
          buildAccountReturnColumns({
            data: params.returnData,
            loading: params.isReturnLoading,
            onOpen: params.onOpenReturn,
            locale,
          }),
          ...metadataColumns,
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
    returnData,
    isReturnLoading,
    onOpenReturn,
    isEquityTab,
    categoryType,
    referenceCurrency,
    onMoveRow,
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
      returnData,
      isReturnLoading,
      onOpenReturn,
      isEquityTab,
      categoryType,
      referenceCurrency,
      onMoveRow,
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
      returnData,
      isReturnLoading,
      onOpenReturn,
      isEquityTab,
      categoryType,
      referenceCurrency,
      onMoveRow,
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
  const locale = useUserLocale();
  const filters = useAccountSetFilters(params.filterContext);
  const refs = useReferenceBalanceColumnRefs(params);
  const options = useAccountColumnOptions(params);
  const balanceColumns = useMemo(
    () =>
      buildAccountBalanceColumns({
        referenceCurrency: options.referenceCurrency,
        ...refs,
        unitFilter: filters.unitIdentifier,
      }),
    [options.referenceCurrency, refs, filters],
  );
  const metadataColumns = useMemo(
    () =>
      buildAccountMetadataColumns({
        grouping: options.grouping,
        assetClasses,
        filters,
      }),
    [options.grouping, assetClasses, filters],
  );
  return useMemo(
    () => buildAccountTreeColumns(options, balanceColumns, metadataColumns, locale),
    [options, balanceColumns, metadataColumns, locale],
  );
}
