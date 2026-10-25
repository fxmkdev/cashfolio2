import { getAccountConstraintMessage } from "@/shared/account-presentation";
import { buildAccountGainLossColumns } from "./-gain-loss-columns";
import type { AccountGainLossSummaries } from "@/shared/account-gain-loss";
import { useMemo, useRef } from "react";
import { Loader, Text } from "@mantine/core";
import {
  type ColDef,
  type ColGroupDef,
  type ICellRendererParams,
} from "ag-grid-enterprise";
import { Unit } from "@/.prisma-client/enums";
import { getAssetClassLabel } from "@/shared/asset-class";
import { FORMATTED_NUMERIC_COLUMN } from "@/components/grid/column-types";
import { getCurrencyDecimals } from "@/shared/unit-format";
import {
  ActiveAccountTreeActionsCell,
  ArchivedAccountTreeActionsCell,
} from "@/components/account-tree/account-tree-actions-cells";
import type { GroupBalanceAggregation } from "./-page-data";
import {
  ROOT_PARENT_KEY,
  isReferenceCurrencyTotalFooterRow,
  type AccountsGridRow,
  toRowTarget,
  type RowTarget,
  type TreeRow,
} from "./-page-types";
import { shouldShowReferenceBalanceLoadingIndicator } from "./-reference-balance-loading";

export function getAccountListAssetClassValue(
  data: AccountsGridRow | undefined,
): string | undefined {
  if (
    !data ||
    isReferenceCurrencyTotalFooterRow(data) ||
    data.nodeType !== "account"
  ) {
    return undefined;
  }
  return getAssetClassLabel(data.assetClass);
}

export function getAccountListUnitIdentifierDisplayValue(args: {
  data: AccountsGridRow | undefined;
  referenceCurrency: string;
}): string | null | undefined {
  const { data, referenceCurrency } = args;

  if (
    !data ||
    isReferenceCurrencyTotalFooterRow(data) ||
    data.nodeType !== "account"
  ) {
    return undefined;
  }
  if (!data.unit) return undefined;
  switch (data.unit) {
    case Unit.CURRENCY:
      return data.currency === referenceCurrency ? undefined : data.currency;
    case Unit.SECURITY:
      return data.symbol;
    case Unit.CRYPTOCURRENCY:
      return data.cryptocurrency;
  }
}

export function getAccountListBalanceValue(args: {
  data: AccountsGridRow | undefined;
  referenceCurrency: string;
}): number | null {
  const { data, referenceCurrency } = args;

  if (
    !data ||
    isReferenceCurrencyTotalFooterRow(data) ||
    data.nodeType !== "account" ||
    (data.unit === Unit.CURRENCY && data.currency === referenceCurrency)
  ) {
    return null;
  }
  return data.balance;
}

export function useAccountTreeColumnDefs(params: {
  gainLossData?: AccountGainLossSummaries;
  isGainLossLoading?: boolean;
  isEquityTab: boolean;
  rowsByParentKey: Map<string, TreeRow[]>;
  referenceCurrency: string;
  isReferenceBalancesLoading: boolean;
  balanceInReferenceCurrencyByGroupId: Map<string, GroupBalanceAggregation>;
  onEditRow: (row: TreeRow) => void;
  onUnarchiveRow: (row: TreeRow) => Promise<void>;
  unarchivePending?: boolean;
  onArchiveRow: (row: RowTarget) => void;
  onDeleteRow: (row: RowTarget) => void;
  onReorderRow: (value: { name: string; parentKey: string }) => void;
}): (ColDef<AccountsGridRow> | ColGroupDef<AccountsGridRow>)[] {
  const {
    gainLossData,
    isGainLossLoading,
    isEquityTab,
    rowsByParentKey,
    referenceCurrency,
    isReferenceBalancesLoading,
    balanceInReferenceCurrencyByGroupId,
    onEditRow,
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

  return useMemo<
    (ColDef<AccountsGridRow> | ColGroupDef<AccountsGridRow>)[]
  >(() => {
    const referenceCurrencyDisplayDecimals =
      getCurrencyDecimals(referenceCurrency);

    return [
      ...(!isEquityTab
        ? [
            {
              colId: "unitIdentifier",
              headerName: "Ccy./Symbol",
              filter: "agTextColumnFilter",
              initialWidth: 130,
              resizable: true,
              valueGetter: ({
                data,
              }: {
                data: AccountsGridRow | undefined;
              }) => {
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
              valueGetter: ({
                data,
              }: {
                data: AccountsGridRow | undefined;
              }) => {
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
              valueGetter: ({
                data,
              }: {
                data: AccountsGridRow | undefined;
              }) => {
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
                    isReferenceBalancesLoading:
                      isReferenceBalancesLoadingRef.current,
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
            {
              colId: "assetClass",
              headerName: "Asset Class",
              width: 220,
              resizable: true,
              sortable: false,
              filter: "agTextColumnFilter",
              valueGetter: ({ data }) => getAccountListAssetClassValue(data),
              tooltipValueGetter: ({ data }) =>
                getAccountListAssetClassValue(data),
              cellRenderer: ({
                value,
              }: ICellRendererParams<AccountsGridRow, string | undefined>) =>
                value === "Unclassified" ? (
                  <Text component="span" inherit c="dimmed">
                    {value}
                  </Text>
                ) : (
                  (value ?? null)
                ),
            } satisfies ColDef<AccountsGridRow>,
            buildAccountGainLossColumns({
              referenceCurrency,
              data: gainLossData,
              loading: isGainLossLoading ?? false,
            }),
          ]
        : []),
      {
        colId: "actions",
        headerName: "",
        width: 145,
        pinned: "right",
        sortable: false,
        filter: false,
        resizable: false,
        suppressHeaderMenuButton: true,
        cellClass: "actions-cell",
        cellRenderer: ({ data }: ICellRendererParams<AccountsGridRow>) => {
          if (!data) return null;
          if (isReferenceCurrencyTotalFooterRow(data)) return null;
          if (data.isVirtualArchivedGroup) return null;

          const parentKey = data.parentId ?? ROOT_PARENT_KEY;
          const siblingCount =
            (rowsByParentKeyRef.current
              .get(parentKey)
              ?.filter((row) => !row.isVirtualArchivedGroup).length ?? 0) - 1;
          const hasSiblings = siblingCount >= 1;
          const reorderLabel = hasSiblings
            ? "Reorder Siblings"
            : "Cannot reorder because this row has no siblings";

          if (!data.isActive) {
            return (
              <ArchivedAccountTreeActionsCell
                unarchivePending={unarchivePending}
                reorderEnabled={hasSiblings}
                reorderLabel={reorderLabel}
                deleteLabel={
                  getAccountConstraintMessage(
                    data.deleteDisabledReason,
                    isEquityTab ? "categories" : "accounts",
                  ) ?? "Delete"
                }
                unarchiveLabel={
                  getAccountConstraintMessage(
                    data.unarchiveDisabledReason,
                    isEquityTab ? "categories" : "accounts",
                  ) ?? "Unarchive"
                }
                deletable={data.deletable}
                unarchivable={data.unarchivable}
                onEdit={() => onEditRow(data)}
                onDelete={() => onDeleteRow(toRowTarget(data))}
                onReorder={() =>
                  onReorderRow({
                    name: data.name,
                    parentKey,
                  })
                }
                onUnarchive={() => void onUnarchiveRow(data)}
              />
            );
          }

          return (
            <ActiveAccountTreeActionsCell
              archiveLabel={
                getAccountConstraintMessage(
                  data.archiveDisabledReason,
                  isEquityTab ? "categories" : "accounts",
                ) ?? "Archive"
              }
              deleteLabel={
                getAccountConstraintMessage(
                  data.deleteDisabledReason,
                  isEquityTab ? "categories" : "accounts",
                ) ?? "Delete"
              }
              archivable={data.archivable}
              deletable={data.deletable}
              reorderEnabled={hasSiblings}
              reorderLabel={reorderLabel}
              onEdit={() => onEditRow(data)}
              onArchive={() => onArchiveRow(toRowTarget(data))}
              onDelete={() => onDeleteRow(toRowTarget(data))}
              onReorder={() =>
                onReorderRow({
                  name: data.name,
                  parentKey,
                })
              }
            />
          );
        },
      } satisfies ColDef<AccountsGridRow>,
    ];
  }, [
    gainLossData,
    isGainLossLoading,
    isEquityTab,
    referenceCurrency,
    onEditRow,
    onUnarchiveRow,
    unarchivePending,
    onArchiveRow,
    onDeleteRow,
    onReorderRow,
  ]);
}
