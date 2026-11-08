import { EditAccountModal } from "@/components/account-editor/edit-account-modal";
import { ConfirmArchiveModal } from "@/components/dialogs/confirm-archive-modal";
import { ConfirmDeleteModal } from "@/components/dialogs/confirm-delete-modal";
import {
  getAccountEntityLabel,
  getAccountManagementContext,
  getAccountConstraintMessage,
} from "@/shared/accounts/account-presentation";
import { createLedgerAccountEditModalProps } from "./account-edit-modal-props";
import type { LedgerPageViewProps } from "./page-view.types";
export function LedgerAccountDialogs({
  account,
  onRefreshConstraints,
  accountEditModalOpened,
  onCloseAccountEdit,
  accountGroups,
  unitUsage,
  onSubmitUpdateAccount,
  accountEditInitialValues,
  existingNodes,
  backTab,
  archivingAccount,
  onCloseArchiveAccount,
  onConfirmArchiveAccount,
  deletingAccount,
  onCloseDeleteAccount,
  onConfirmDeleteAccount,
}: Pick<
  LedgerPageViewProps,
  | "account"
  | "onRefreshConstraints"
  | "accountEditModalOpened"
  | "onCloseAccountEdit"
  | "accountGroups"
  | "unitUsage"
  | "onSubmitUpdateAccount"
  | "accountEditInitialValues"
  | "existingNodes"
  | "backTab"
  | "archivingAccount"
  | "onCloseArchiveAccount"
  | "onConfirmArchiveAccount"
  | "deletingAccount"
  | "onCloseDeleteAccount"
  | "onConfirmDeleteAccount"
>) {
  const entityLabel = getAccountEntityLabel(account);
  const context = getAccountManagementContext(account);
  const formatErrorMessage = (message: string) =>
    getAccountConstraintMessage(message, context) ?? message;
  return (
    <>
      <EditAccountModal
        onRefreshConstraints={onRefreshConstraints}
        {...createLedgerAccountEditModalProps({
          opened: accountEditModalOpened,
          onClose: onCloseAccountEdit,
          accountGroups,
          unitUsage,
          onSubmit: onSubmitUpdateAccount,
          initialValues: accountEditInitialValues,
          existingNodes,
          editingId: account.id,
          typeDescriptor: backTab,
        })}
      />

      <ConfirmArchiveModal
        formatErrorMessage={formatErrorMessage}
        onRefreshConstraints={onRefreshConstraints}
        opened={!!archivingAccount}
        onClose={onCloseArchiveAccount}
        title={`Archive ${entityLabel}`}
        name={archivingAccount?.name}
        onConfirm={onConfirmArchiveAccount}
      />

      <ConfirmDeleteModal
        formatErrorMessage={formatErrorMessage}
        onRefreshConstraints={onRefreshConstraints}
        opened={!!deletingAccount}
        onClose={onCloseDeleteAccount}
        title={`Delete ${entityLabel}`}
        name={deletingAccount?.name}
        onConfirm={onConfirmDeleteAccount}
      />
    </>
  );
}
