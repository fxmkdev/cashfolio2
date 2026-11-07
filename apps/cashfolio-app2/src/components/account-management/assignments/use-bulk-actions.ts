import { useBulkAccountSelection } from "../grid/use-bulk-selection";
import { useBulkAssignmentActions } from "./use-assignment-actions";
import { isTrackingMethodAccount } from "./targets";
import type { BulkAccountActionOptions } from "./types";

export function useBulkAccountActions(args: BulkAccountActionOptions) {
  const selection = useBulkAccountSelection(args);
  const assignments = useBulkAssignmentActions(args, selection);
  return {
    gridProps: selection.gridProps,
    selectedCount: selection.selectedAccounts.length,
    trackingMethodEligibleCount: selection.selectedAccounts.filter(
      isTrackingMethodAccount,
    ).length,
    clearSelection: selection.clearSelection,
    ...assignments,
  };
}
export type BulkAccountActions = ReturnType<typeof useBulkAccountActions>;
