import { Modal } from "@mantine/core";
import { SimpleTransactionModal } from "@/components/transactions/simple-transaction-modal";
import { EditTransactionModal } from "@/components/transaction-editor/edit-transaction-modal";
import { getAccountEntityLabel } from "@/shared/account-presentation";
import type { LedgerTransactionEditDialogProps } from "./transaction-dialog.types";
export function LedgerTransactionEditDialog({
  account,
  currentAccountLabel,
  accountBookStartDate,
  onRefreshConstraints,
  editModalOpened,
  isEditSubmitting,
  onCloseEditModal,
  editMode,
  onEditModalExitTransitionEnd,
  editingTransactionData,
  editingSimpleInitialValues,
  editSimpleCounterAccountOptions,
  onSwitchToSplit,
  onEditSubmittingChange,
  onSubmitUpdateSimpleTransaction,
  editAccountOptions,
  unitUsage,
  onSubmitUpdateTransaction,
}: LedgerTransactionEditDialogProps) {
  const entityLabel = getAccountEntityLabel(account);
  return (
    <Modal
      opened={editModalOpened}
      onClose={() => {
        if (isEditSubmitting) return;
        onCloseEditModal();
      }}
      title="Edit Transaction"
      size={editMode === "SIMPLE" ? "xl" : "100%"}
      closeOnEscape={!isEditSubmitting}
      closeOnClickOutside={!isEditSubmitting}
      withCloseButton={!isEditSubmitting}
      onExitTransitionEnd={onEditModalExitTransitionEnd}
    >
      {editingTransactionData &&
      editMode === "SIMPLE" &&
      editingSimpleInitialValues ? (
        <SimpleTransactionModal
          onRefreshConstraints={onRefreshConstraints}
          currentAccount={{
            id: account.id,
            label: currentAccountLabel,
            entityLabel,
          }}
          accounts={editSimpleCounterAccountOptions}
          initialValues={editingSimpleInitialValues}
          accountBookStartDate={accountBookStartDate}
          submitLabel="Save"
          onSwitchToSplit={onSwitchToSplit}
          onClose={() => {
            if (isEditSubmitting) return;
            onCloseEditModal();
          }}
          onSubmittingChange={onEditSubmittingChange}
          onSubmit={onSubmitUpdateSimpleTransaction}
        />
      ) : editingTransactionData ? (
        <EditTransactionModal
          onRefreshConstraints={onRefreshConstraints}
          initialValues={editingTransactionData}
          accounts={editAccountOptions}
          currentAccountId={account.id}
          accountBookStartDate={accountBookStartDate}
          unitUsage={unitUsage}
          onClose={() => {
            if (isEditSubmitting) return;
            onCloseEditModal();
          }}
          onSubmittingChange={onEditSubmittingChange}
          onSubmit={onSubmitUpdateTransaction}
        />
      ) : null}
    </Modal>
  );
}
