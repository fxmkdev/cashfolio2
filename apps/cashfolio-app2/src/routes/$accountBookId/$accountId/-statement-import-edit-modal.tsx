import { Modal } from "@mantine/core";
import {
  EditTransactionModal,
  type AccountOption,
} from "@/components/edit-transaction-modal";
import type { AccountBookUnitUsage } from "@/shared/account-book-unit-usage";
import type { LedgerAccount } from "./-page-types";
import type { TransactionMutationValues } from "./-page-view";
import {
  toStatementImportEditInitialValues,
  type StatementImportDraft,
} from "./-statement-import";

export function StatementImportEditModal({
  account,
  accountBookStartDate,
  accountOptions,
  editingDraft,
  isEditSubmitting,
  unitUsage,
  onClose,
  onSaveDraft,
  onSubmittingChange,
  onDirtyChange,
}: {
  account: LedgerAccount;
  accountBookStartDate: Date;
  accountOptions: AccountOption[];
  editingDraft: StatementImportDraft | undefined;
  isEditSubmitting: boolean;
  unitUsage: AccountBookUnitUsage;
  onClose: () => void;
  onSaveDraft: (values: TransactionMutationValues) => Promise<void>;
  onSubmittingChange: (isSubmitting: boolean) => void;
  onDirtyChange: (isDirty: boolean) => void;
}) {
  return (
    <Modal
      opened={!!editingDraft}
      onClose={onClose}
      title="Edit Imported Transaction"
      size="100%"
      closeOnEscape={!isEditSubmitting}
      closeOnClickOutside={!isEditSubmitting}
      withCloseButton={!isEditSubmitting}
    >
      {editingDraft ? (
        <EditTransactionModal
          initialValues={toStatementImportEditInitialValues(editingDraft)}
          submitLabel="Save Draft"
          accounts={accountOptions}
          currentAccountId={account.id}
          accountBookStartDate={accountBookStartDate}
          unitUsage={unitUsage}
          preserveBookingUnitOnUnitlessEquityAccountChange
          onClose={onClose}
          onSubmittingChange={onSubmittingChange}
          onDirtyChange={onDirtyChange}
          onSubmit={onSaveDraft}
        />
      ) : null}
    </Modal>
  );
}
