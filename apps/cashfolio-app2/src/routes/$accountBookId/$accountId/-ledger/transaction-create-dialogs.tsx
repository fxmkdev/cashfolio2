import { Modal } from "@mantine/core";
import { SimpleTransactionModal } from "@/components/transactions/simple-transaction-modal";
import { EditTransactionModal } from "@/components/transaction-editor/edit-transaction-modal";
import { getTransactionCreateDialogText } from "@/components/transactions/transaction-create-dialog-text";
import { getAccountEntityLabel } from "@/shared/accounts/account-presentation";
import type { LedgerTransactionCreateDialogsProps } from "./transaction-dialog.types";
export type { LedgerTransactionCreateDialogsProps } from "./transaction-dialog.types";
function SimpleCreateDialog({
  account,
  currentAccountLabel,
  accountBookStartDate,
  onRefreshConstraints,
  simpleModalOpened,
  isSimpleSubmitting,
  onCloseSimpleModal,
  onSimpleModalExitTransitionEnd,
  createSimpleInitialValues,
  editSimpleCounterAccountOptions,
  simpleCounterAccountOptions,
  onSwitchCreateToSplit,
  onSimpleSubmittingChange,
  onSubmitCreateSimpleTransaction,
}: Pick<
  LedgerTransactionCreateDialogsProps,
  | "account"
  | "currentAccountLabel"
  | "accountBookStartDate"
  | "onRefreshConstraints"
  | "simpleModalOpened"
  | "isSimpleSubmitting"
  | "onCloseSimpleModal"
  | "onSimpleModalExitTransitionEnd"
  | "createSimpleInitialValues"
  | "editSimpleCounterAccountOptions"
  | "simpleCounterAccountOptions"
  | "onSwitchCreateToSplit"
  | "onSimpleSubmittingChange"
  | "onSubmitCreateSimpleTransaction"
>) {
  const entityLabel = getAccountEntityLabel(account);
  const simpleCreateDialogText = getTransactionCreateDialogText(
    !!createSimpleInitialValues,
  );
  return (
    <Modal
      opened={simpleModalOpened}
      onClose={() => {
        if (isSimpleSubmitting) return;
        onCloseSimpleModal();
      }}
      title={simpleCreateDialogText.title}
      size="xl"
      closeOnEscape={!isSimpleSubmitting}
      closeOnClickOutside={!isSimpleSubmitting}
      withCloseButton={!isSimpleSubmitting}
      onExitTransitionEnd={onSimpleModalExitTransitionEnd}
    >
      <SimpleTransactionModal
        onRefreshConstraints={onRefreshConstraints}
        currentAccount={{
          id: account.id,
          label: currentAccountLabel,
          entityLabel,
        }}
        accounts={
          createSimpleInitialValues
            ? editSimpleCounterAccountOptions
            : simpleCounterAccountOptions
        }
        initialValues={createSimpleInitialValues}
        accountBookStartDate={accountBookStartDate}
        autoFocusDate={!!createSimpleInitialValues}
        submitLabel={simpleCreateDialogText.submitLabel}
        onSwitchToSplit={onSwitchCreateToSplit}
        onClose={() => {
          if (isSimpleSubmitting) return;
          onCloseSimpleModal();
        }}
        onSubmittingChange={onSimpleSubmittingChange}
        onSubmit={onSubmitCreateSimpleTransaction}
      />
    </Modal>
  );
}
function SplitCreateDialog({
  account,
  accountBookStartDate,
  onRefreshConstraints,
  splitModalOpened,
  isCreateSplitSubmitting,
  onCloseSplitModal,
  onCreateSplitModalExitTransitionEnd,
  createSplitInitialValues,
  createSplitIsCopy,
  createSplitDateAutoFocus,
  editAccountOptions,
  accountOptions,
  unitUsage,
  onCreateSplitSubmittingChange,
  onSubmitCreateTransaction,
}: Pick<
  LedgerTransactionCreateDialogsProps,
  | "account"
  | "accountBookStartDate"
  | "onRefreshConstraints"
  | "splitModalOpened"
  | "isCreateSplitSubmitting"
  | "onCloseSplitModal"
  | "onCreateSplitModalExitTransitionEnd"
  | "createSplitInitialValues"
  | "createSplitIsCopy"
  | "createSplitDateAutoFocus"
  | "editAccountOptions"
  | "accountOptions"
  | "unitUsage"
  | "onCreateSplitSubmittingChange"
  | "onSubmitCreateTransaction"
>) {
  const splitCreateDialogText =
    getTransactionCreateDialogText(!!createSplitIsCopy);
  return (
    <Modal
      opened={splitModalOpened}
      onExitTransitionEnd={onCreateSplitModalExitTransitionEnd}
      onClose={() => {
        if (isCreateSplitSubmitting) return;
        onCloseSplitModal();
      }}
      title={splitCreateDialogText.title}
      size="100%"
      closeOnEscape={!isCreateSplitSubmitting}
      closeOnClickOutside={!isCreateSplitSubmitting}
      withCloseButton={!isCreateSplitSubmitting}
    >
      <EditTransactionModal
        onRefreshConstraints={onRefreshConstraints}
        initialValues={createSplitInitialValues}
        submitLabel={splitCreateDialogText.submitLabel}
        accounts={
          createSplitInitialValues ? editAccountOptions : accountOptions
        }
        currentAccountId={account.id}
        accountBookStartDate={accountBookStartDate}
        unitUsage={unitUsage}
        autoFocusDate={createSplitDateAutoFocus}
        onClose={() => {
          if (isCreateSplitSubmitting) return;
          onCloseSplitModal();
        }}
        onSubmittingChange={onCreateSplitSubmittingChange}
        onSubmit={onSubmitCreateTransaction}
      />
    </Modal>
  );
}
export function LedgerTransactionCreateDialogs(
  props: LedgerTransactionCreateDialogsProps,
) {
  return (
    <>
      <SimpleCreateDialog {...props} />
      <SplitCreateDialog {...props} />
    </>
  );
}
