import { useBulkAccountActions } from "./use-bulk-account-actions";
import { useUnarchiveMutation } from "@/hooks/use-unarchive-mutation";
import {
  setAccountsAssetClass,
  setAccountsTrackingMethod,
} from "@/server/accounts";
import { useAccountsPageModalState } from "./page-modal-state";
import type { AccountsPageViewProps } from "./page-view";
import {
  getAccountConstraintMessage,
  type AccountManagementContext,
} from "@/shared/account-presentation";
import {
  isPersistedTreeRow,
  isPersistedGroupRow,
  type PersistedGroupRow,
} from "./page-types";
import { createAccountsMutationActions } from "./account-mutations";

type ManagementOptions = {
  accountBookId: string;
  scopeKey: string;
  managementContext?: AccountManagementContext;
  grouping: NonNullable<AccountsPageViewProps["grouping"]>;
  isEquityTab: boolean;
  rows: AccountsPageViewProps["rows"];
  accountGroups: AccountsPageViewProps["accountGroups"];
  modalState: ReturnType<typeof useAccountsPageModalState>;
  invalidate: () => void;
  onRefreshConstraints: () => Promise<void>;
};
type ManagementActions = ReturnType<typeof createAccountsMutationActions>;
function getMutationState(modalState: ManagementOptions["modalState"]) {
  return {
    getEditingAccount: () => modalState.editingAccount,
    getEditingGroup: () => modalState.editingGroup,
    getDeletingRow: () => modalState.deletingRow,
    getArchivingRow: () => modalState.archivingRow,
    setCreateModalOpened: modalState.setCreateModalOpened,
    setEditModalOpen: modalState.setEditModalOpen,
    setCreateGroupModalOpened: modalState.setCreateGroupModalOpened,
    setEditGroupModalOpen: modalState.setEditGroupModalOpen,
    setDeletingRow: modalState.setDeletingRow,
    setArchivingRow: modalState.setArchivingRow,
  };
}
function useAccountUnarchiveRecovery(
  args: ManagementOptions,
  actions: ManagementActions,
) {
  const { rows, scopeKey, onRefreshConstraints } = args;
  const unarchiveRecovery = useUnarchiveMutation({
    scopeKey,
    onUnarchive: actions.handleUnarchiveRow,
    formatErrorMessage: (message) =>
      getAccountConstraintMessage(
        message,
        args.managementContext ?? "accounts",
      ) ?? message,
    onRefreshConstraints,
    isEligible: (target) =>
      rows.some(
        (row) =>
          isPersistedTreeRow(row) &&
          row.id === target.id &&
          row.nodeType === target.nodeType &&
          row.unarchivable,
      ),
  });

  return unarchiveRecovery;
}
function createAddChildAction(args: ManagementOptions) {
  const { modalState } = args;
  const onAddChild = (
    row: PersistedGroupRow,
    kind: "account" | "accountGroup",
  ) => {
    if (
      !isPersistedGroupRow(row) ||
      !row.isActive ||
      !args.accountGroups.some((group) => group.value === row.id)
    )
      return;
    if (kind === "account") modalState.openCreateAccount(row.id);
    else modalState.openCreateGroup(row.id);
  };

  return onAddChild;
}
export function useAccountsManagement(args: ManagementOptions) {
  const actions = createAccountsMutationActions({
    accountBookId: args.accountBookId,
    invalidate: args.invalidate,
    state: getMutationState(args.modalState),
  });
  const unarchiveRecovery = useAccountUnarchiveRecovery(args, actions);
  const bulkAccountActions = useBulkAccountActions({
    scopeKey: `${args.scopeKey}:${args.grouping}`,
    enabled: !args.isEquityTab,
    rows: args.rows,
    submitAssetClass: (accountIds, assetClassId) =>
      setAccountsAssetClass({
        data: { accountBookId: args.accountBookId, accountIds, assetClassId },
      }),
    submitTrackingMethod: (accountIds, trackingMethod) =>
      setAccountsTrackingMethod({
        data: { accountBookId: args.accountBookId, accountIds, trackingMethod },
      }),
    invalidate: args.invalidate,
    onRefreshConstraints: args.onRefreshConstraints,
  });
  return {
    actions,
    unarchiveRecovery,
    bulkAccountActions,
    onAddChild: createAddChildAction(args),
  };
}
