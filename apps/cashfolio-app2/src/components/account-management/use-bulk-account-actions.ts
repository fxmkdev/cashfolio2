import { useBulkAccountSelection } from "./use-bulk-account-selection";
import { useBulkAssignmentActions } from "./use-bulk-assignment-actions";
import { isTrackingMethodAccount } from "./bulk-account-targets";
import type { BulkAccountActionOptions } from "./bulk-account-action-types";

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
