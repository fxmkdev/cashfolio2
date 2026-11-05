import { useMemo, useRef, useState } from "react";
import type { GridApi } from "ag-grid-enterprise";
import { useExpandedGroups } from "@/hooks/use-expanded-groups";
import type { ReportingGrouping } from "@/shared/reporting-grouping";
import { buildUnifiedAccountTreeRows } from "@/shared/archived-account-tree-rows";
import { isVirtualArchivedGroup } from "../-archived-grid-rows";
import { useAccountsPresentation } from "../-use-accounts-presentation";
import { useSelectedSiblingRows } from "../-page-data";
import { useBulkAccountActions } from "../-use-bulk-account-actions";
import { useAccountTreeColumnDefs } from "../-page-columns";
import type { AccountsGridRow } from "../-page-types";
import { getRowsFor } from "./fixtures";
import { getStoryGainLossData } from "./gain-loss-fixtures";
import { useStoryRouting } from "./use-story-routing";
import { useStoryAssignments } from "./use-story-assignments";
import { useStoryModals } from "./use-story-modals";
import type { AccountsStoryOptions } from "./types";

export function useAccountsStoryModel(options: AccountsStoryOptions) {
  const routing = useStoryRouting(options);
  const { tab, mode, showArchived, isEquityTab } = routing;
  const assignments = useStoryAssignments(options.assignmentFailsOnce);
  const { assetClasses, trackingMethods } = assignments;
  const modalState = useStoryModals(options);
  const [grouping, setGrouping] = useState<ReportingGrouping>(
    options.initialGrouping ?? "accountStructure",
  );
  const expansion = useExpandedGroups(
    `storybook:account-grouping:${grouping}`,
    isVirtualArchivedGroup,
  );
  const bulkApiRef = useRef<GridApi<AccountsGridRow> | null>(null);
  const [gainLossState, setGainLossState] = useState(
    options.gainLossState ?? "ready",
  );
  const sourceRows = useMemo(() => {
    const sourceRows = (
      options.rowsOverride ?? getRowsFor({ mode, tab, showArchived })
    ).map((row) => ({
      ...row,
      ...(Object.hasOwn(assetClasses, row.id)
        ? { assetClassId: assetClasses[row.id] }
        : {}),
      ...(Object.hasOwn(trackingMethods, row.id)
        ? { trackingMethod: trackingMethods[row.id] }
        : {}),
    }));
    return tab.startsWith("EQUITY-") && !showArchived
      ? sourceRows
      : buildUnifiedAccountTreeRows(sourceRows);
  }, [
    mode,
    tab,
    showArchived,
    options.rowsOverride,
    assetClasses,
    trackingMethods,
  ]);

  const rawGainLoss = getStoryGainLossData(sourceRows, gainLossState);
  const presentation = useAccountsPresentation({
    sourceRows,
    grouping,
    isEquityTab,
    gainLossData: rawGainLoss,
  });
  const { rows, rowsByParentKey, balanceInReferenceCurrencyByGroupId } =
    presentation;
  const selectedSiblingRows = useSelectedSiblingRows(
    rowsByParentKey,
    modalState.reorderingRow,
  );
  const assignment = useBulkAccountActions({
    scopeKey: `${assignments.scope}:${tab}:${mode}:${grouping}`,
    enabled: !!options.bulkAssignment && !isEquityTab,
    rows,
    ...assignments.mutations,
  });
  const columnDefs = useAccountTreeColumnDefs({
    grouping,
    gainLossData:
      isEquityTab || gainLossState === "loading" || gainLossState === "error"
        ? undefined
        : presentation.gainLossData,
    isGainLossLoading: gainLossState === "loading",
    isEquityTab,
    categoryType: tab === "EQUITY-INCOME" ? "INCOME" : "EXPENSE",
    rowsByParentKey,
    referenceCurrency: "CHF",
    isReferenceBalancesLoading: false,
    balanceInReferenceCurrencyByGroupId,
    onAddChild: (row, kind) =>
      kind === "account"
        ? modalState.openCreateAccount(row.id)
        : modalState.openCreateGroup(row.id),
    onEditRow: modalState.handleEditRow,
    onUnarchiveRow: async () => {
      routing.setModeState("active");
    },
    onArchiveRow: modalState.setArchivingRow,
    onDeleteRow: modalState.setDeletingRow,
    onReorderRow: modalState.setReorderingRow,
  });
  return {
    routing,
    assignments,
    modalState,
    grouping,
    setGrouping,
    expansion,
    bulkApiRef,
    gainLossState,
    setGainLossState,
    presentation,
    selectedSiblingRows,
    assignment,
    columnDefs,
  };
}
