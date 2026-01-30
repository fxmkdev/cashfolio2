import { Group } from "@mantine/core";
import { useState } from "react";
import {
  CancelButton,
  DeleteButton,
  FormDialog,
} from "~/platform/forms/form-dialog";

export function useDeleteAccountBook() {
  const [isOpen, setAlertOpen] = useState(false);
  const [accountBookId, setAccountBookId] = useState<string>();

  function onDeleteAccountBook(accountId: string) {
    setAccountBookId(accountId);
    setAlertOpen(true);
  }
  return {
    deleteAccountBookProps: {
      isOpen,
      onClose: () => setAlertOpen(false),
      accountBookId,
    },
    onDeleteAccountBook,
  };
}

export function DeleteAccountBook({
  isOpen,
  onClose,
  accountBookId,
}: {
  isOpen: boolean;
  onClose: () => void;
  accountBookId?: string;
}) {
  return (
    <FormDialog
      opened={isOpen}
      onClose={onClose}
      size="md"
      action="/account-books/delete"
      title="Are you sure you want to delete this account book?"
    >
      <input type="hidden" name="_action" value="delete" />
      <input type="hidden" name="accountBookId" value={accountBookId} />
      <Group justify="end">
        <CancelButton />
        <DeleteButton />
      </Group>
    </FormDialog>
  );
}
