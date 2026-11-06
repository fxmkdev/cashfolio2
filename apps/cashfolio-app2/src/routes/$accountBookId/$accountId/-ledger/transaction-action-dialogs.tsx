import { Modal } from "@mantine/core";
import { RebookBookingModal } from "@/components/transactions/rebook-booking-modal";
import { ConfirmDeleteModal } from "@/components/dialogs/confirm-delete-modal";
import type { LedgerPageViewProps } from "./page-view.types";
export type LedgerTransactionActionDialogsProps = Pick<
  LedgerPageViewProps,
  | "rebookModalOpened"
  | "isRebookSubmitting"
  | "onCloseRebookModal"
  | "onRebookModalExitTransitionEnd"
  | "rebooking"
  | "onRefreshConstraints"
  | "rebookTargetAccountOptions"
  | "hasCompleteBookingUnit"
  | "onRebookSubmittingChange"
  | "onSubmitRebookBooking"
  | "deletingTransaction"
  | "onCloseDeleteModal"
  | "onConfirmDeleteTransaction"
>;
function RebookDialog({
  rebookModalOpened,
  isRebookSubmitting,
  onCloseRebookModal,
  onRebookModalExitTransitionEnd,
  rebooking,
  onRefreshConstraints,
  rebookTargetAccountOptions,
  hasCompleteBookingUnit,
  onRebookSubmittingChange,
  onSubmitRebookBooking,
}: Pick<
  LedgerPageViewProps,
  | "rebookModalOpened"
  | "isRebookSubmitting"
  | "onCloseRebookModal"
  | "onRebookModalExitTransitionEnd"
  | "rebooking"
  | "onRefreshConstraints"
  | "rebookTargetAccountOptions"
  | "hasCompleteBookingUnit"
  | "onRebookSubmittingChange"
  | "onSubmitRebookBooking"
>) {
  return (
    <Modal
      opened={rebookModalOpened}
      onClose={() => {
        if (isRebookSubmitting) return;
        onCloseRebookModal();
      }}
      title="Rebook Booking"
      size="md"
      closeOnEscape={!isRebookSubmitting}
      closeOnClickOutside={!isRebookSubmitting}
      withCloseButton={!isRebookSubmitting}
      onExitTransitionEnd={onRebookModalExitTransitionEnd}
    >
      {rebooking && (
        <RebookBookingModal
          onRefreshConstraints={onRefreshConstraints}
          targetAccounts={rebookTargetAccountOptions}
          disabledReason={
            !hasCompleteBookingUnit
              ? "This booking has incomplete unit data and cannot be rebooked."
              : undefined
          }
          onClose={() => {
            if (isRebookSubmitting) return;
            onCloseRebookModal();
          }}
          onSubmittingChange={onRebookSubmittingChange}
          onSubmit={onSubmitRebookBooking}
        />
      )}
    </Modal>
  );
}
function DeleteTransactionDialog({
  onRefreshConstraints,
  deletingTransaction,
  onCloseDeleteModal,
  onConfirmDeleteTransaction,
}: Pick<
  LedgerPageViewProps,
  | "onRefreshConstraints"
  | "deletingTransaction"
  | "onCloseDeleteModal"
  | "onConfirmDeleteTransaction"
>) {
  return (
    <ConfirmDeleteModal
      onRefreshConstraints={onRefreshConstraints}
      opened={!!deletingTransaction}
      onClose={onCloseDeleteModal}
      title="Delete Transaction"
      name={deletingTransaction?.description}
      onConfirm={onConfirmDeleteTransaction}
    />
  );
}
export function LedgerTransactionActionDialogs(
  props: LedgerTransactionActionDialogsProps,
) {
  return (
    <>
      <RebookDialog {...props} />
      <DeleteTransactionDialog {...props} />
    </>
  );
}
