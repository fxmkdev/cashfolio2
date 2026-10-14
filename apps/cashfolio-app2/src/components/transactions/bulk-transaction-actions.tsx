import { Button, Group, Modal, Text } from "@mantine/core";
import { IconSquareArrowRight, IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import type { BulkTransactionActionState } from "@/hooks/use-bulk-transaction-actions";
import { ConfirmDeleteModal } from "../dialogs/confirm-delete-modal";
import { RebookBookingModal } from "./rebook-booking-modal";

export function BulkTransactionToolbar({
  actions,
}: {
  actions: BulkTransactionActionState;
}) {
  if (!actions.selectedCount) return null;
  return (
    <Group mb="sm" gap="sm" role="toolbar" aria-label="Selected Row Actions">
      <Text size="sm" role="status">
        {actions.selectedCount}{" "}
        {actions.selectedCount === 1
          ? actions.selectionLabel.toLowerCase().slice(0, -1)
          : actions.selectionLabel.toLowerCase()}{" "}
        selected
      </Text>
      {actions.onRebook && (
        <Button
          variant="light"
          leftSection={<IconSquareArrowRight size={16} />}
          onClick={actions.onRebook}
        >
          Rebook Selected
        </Button>
      )}
      <Button
        color="red"
        variant="light"
        leftSection={<IconTrash size={16} />}
        onClick={actions.onDelete}
      >
        Delete Selected
      </Button>
      <Button variant="subtle" onClick={actions.onClear}>
        Clear Selection
      </Button>
    </Group>
  );
}

export function BulkTransactionDialogs({
  actions,
}: {
  actions: BulkTransactionActionState;
}) {
  const [isRebookSubmitting, setIsRebookSubmitting] = useState(false);
  const rebook =
    actions.dialog?.action === "rebook" ? actions.dialog : undefined;
  const deletion =
    actions.dialog?.action === "delete" ? actions.dialog : undefined;
  return (
    <>
      <ConfirmDeleteModal
        opened={!!deletion && actions.dialogOpened}
        onExitTransitionEnd={actions.onExited}
        onClose={actions.onClose}
        title="Delete Transactions"
        name={`${deletion?.transactionIds.length ?? 0} selected ${(deletion?.transactionIds.length ?? 0) === 1 ? "transaction" : "transactions"}`}
        description="All bookings in these transactions, including bookings in other accounts, will be permanently deleted."
        onConfirm={actions.onConfirmDelete}
        onRefreshConstraints={actions.onRefreshConstraints}
      />
      <Modal
        opened={!!rebook && actions.dialogOpened}
        onExitTransitionEnd={actions.onExited}
        onClose={() => {
          if (!isRebookSubmitting) actions.onClose();
        }}
        title="Rebook Bookings"
        closeOnEscape={!isRebookSubmitting}
        closeOnClickOutside={!isRebookSubmitting}
        withCloseButton={!isRebookSubmitting}
      >
        {rebook && (
          <RebookBookingModal
            description={`Move ${rebook.bookings.length} selected ${rebook.bookings.length === 1 ? "booking" : "bookings"} to the target account.`}
            targetAccounts={actions.targetAccounts}
            disabledReason={
              actions.targetAccounts.length === 0
                ? "No target account is compatible with every selected booking. Adjust your selection and try again."
                : undefined
            }
            onClose={actions.onClose}
            onSubmittingChange={setIsRebookSubmitting}
            onSubmit={actions.onSubmitRebook}
            onRefreshConstraints={actions.onRefreshConstraints}
          />
        )}
      </Modal>
    </>
  );
}
