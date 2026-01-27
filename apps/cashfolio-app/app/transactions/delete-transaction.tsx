import { Group, Stack, Text } from "@mantine/core";
import { useState } from "react";
import { useAccountBook } from "~/account-books/hooks";
import {
  CancelButton,
  DeleteButton,
  FormDialog,
} from "~/platform/forms/form-dialog";

export function useDeleteTransaction() {
  const [isOpen, setIsOpen] = useState(false);
  const [transactionId, setTransactionId] = useState<string>();

  function onDeleteTransaction(transactionId: string) {
    setTransactionId(transactionId);
    setIsOpen(true);
  }
  return {
    deleteTransactionProps: {
      isOpen,
      onClose: () => setIsOpen(false),
      transactionId,
    },
    onDeleteTransaction,
  };
}

export function DeleteTransaction({
  isOpen,
  onClose,
  transactionId,
}: {
  isOpen: boolean;
  onClose: () => void;
  transactionId?: string;
}) {
  const accountBook = useAccountBook();
  return (
    <FormDialog
      title="Are you sure you want to delete this transaction?"
      opened={isOpen}
      onClose={onClose}
      size="md"
      action={`/${accountBook.id}/transactions/delete`}
    >
      <input type="hidden" name="transactionId" value={transactionId} />
      <Stack gap="lg">
        <Text size="sm">
          This will delete the transaction and all its associated bookings.
        </Text>
        <Group justify="end">
          <CancelButton data-autofocus />
          <DeleteButton />
        </Group>
      </Stack>
    </FormDialog>
  );
}
