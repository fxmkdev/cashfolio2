import { useBulkAccountActions } from "./-use-bulk-account-actions";
import { useUnarchiveMutation } from "@/hooks/use-unarchive-mutation";
import {
  setAccountsAssetClass,
  setAccountsTrackingMethod,
} from "@/server/accounts";
import { useAccountsPageModalState } from "./-page-modal-state";
import type { AccountsPageViewProps } from "./-page-view";
import {
  getAccountConstraintMessage,
  type AccountManagementContext,
} from "@/shared/account-presentation";
import type { TreeRow } from "./-page-types";
import { createAccountsMutationActions } from "./-account-mutations";
export function useAccountsManagement(args: {
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
}) {
  const {
    modalState,
    rows,
    scopeKey,
    grouping,
    isEquityTab,
    onRefreshConstraints,
  } = args;
  const actions = createAccountsMutationActions({
    accountBookId: args.accountBookId,
    invalidate: args.invalidate,
    state: {
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
    },
  });

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
          row.id === target.id &&
          row.nodeType === target.nodeType &&
          row.unarchivable,
      ),
  });
  const bulkAccountActions = useBulkAccountActions({
    scopeKey: `${scopeKey}:${grouping}`,
    enabled: !isEquityTab,
    rows,
    submitAssetClass: (accountIds, assetClassId) =>
      setAccountsAssetClass({
        data: { accountBookId: args.accountBookId, accountIds, assetClassId },
      }),
    submitTrackingMethod: (accountIds, trackingMethod) =>
      setAccountsTrackingMethod({
        data: { accountBookId: args.accountBookId, accountIds, trackingMethod },
      }),
    invalidate: args.invalidate,
    onRefreshConstraints,
  });

  const onAddChild = (row: TreeRow, kind: "account" | "accountGroup") => {
    if (
      row.nodeType !== "accountGroup" ||
      !row.isActive ||
      row.isVirtualArchivedGroup ||
      row.presentationKind ||
      !args.accountGroups.some((group) => group.value === row.id)
    )
      return;
    if (kind === "account") modalState.openCreateAccount(row.id);
    else modalState.openCreateGroup(row.id);
  };
  return { actions, unarchiveRecovery, bulkAccountActions, onAddChild };
}
