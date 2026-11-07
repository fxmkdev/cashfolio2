import { isVirtualArchivedGroup } from "./archived-rows";
import type { GridApi, GridReadyEvent } from "ag-grid-enterprise";
import { useCallback, useEffect, useRef } from "react";
import { useExpandedGroups } from "@/hooks/use-expanded-groups";
import { type AccountsGridRow } from "./rows";
import type { AccountsPageViewProps } from "../view-types";
export function useAccountsGrid({
  accountBookId,
  tab,
  managementContext,
  grouping,
  showArchived,
  shouldShowReferenceBalancesLoading,
  returnCellVersion,
}: Pick<
  AccountsPageViewProps,
  "accountBookId" | "tab" | "managementContext"
> & {
  grouping: NonNullable<AccountsPageViewProps["grouping"]>;
  showArchived: boolean;
  shouldShowReferenceBalancesLoading: boolean;
  returnCellVersion?: string;
}) {
  const gridApiRef = useRef<GridApi<AccountsGridRow> | null>(null);
  const storageKey = `cashfolio:expandedGroups:${accountBookId}:active:${tab}${grouping === "assetClass" ? ":assetClass" : ""}`;
  const { isGroupOpenByDefault, onRowGroupOpened } = useExpandedGroups(
    storageKey,
    isVirtualArchivedGroup,
    managementContext === "categories" && !showArchived,
    tab === "BALANCE" && grouping === "accountStructure"
      ? [
          `cashfolio:expandedGroups:${accountBookId}:active:ASSET`,
          `cashfolio:expandedGroups:${accountBookId}:active:LIABILITY`,
        ]
      : undefined,
  );

  useEffect(() => {
    gridApiRef.current?.refreshCells({
      columns: ["balanceInReferenceCurrency"],
      force: true,
    });
  }, [shouldShowReferenceBalancesLoading]);

  useEffect(() => {
    gridApiRef.current?.refreshCells({
      columns: ["return-twr", "return-mwr"],
      force: true,
    });
  }, [returnCellVersion]);

  const handleGridReady = useCallback(
    (event: GridReadyEvent<AccountsGridRow>) => {
      gridApiRef.current = event.api;
    },
    [],
  );

  return {
    onGridReady: handleGridReady,
    isGroupOpenByDefault,
    onRowGroupOpened,
  };
}
