import { Group } from "@mantine/core";
import { useState } from "react";
import { useAccountBook } from "~/account-books/hooks";
import {
  CancelButton,
  DeleteButton,
  FormDialog,
} from "~/platform/forms/form-dialog";

export function useDeleteAccountGroup() {
  const [isOpen, setAlertOpen] = useState(false);
  const [accountGroupId, setAccountGroupId] = useState<string>();

  function onDeleteAccountGroup(accountGroupId: string) {
    setAccountGroupId(accountGroupId);
    setAlertOpen(true);
  }
  return {
    deleteAccountGroupProps: {
      isOpen,
      onClose: () => setAlertOpen(false),
      accountGroupId,
    },
    onDeleteAccountGroup,
  };
}

export function DeleteAccountGroup({
  isOpen,
  onClose,
  accountGroupId,
}: {
  isOpen: boolean;
  onClose: () => void;
  accountGroupId?: string;
}) {
  const accountBook = useAccountBook();
  return (
    <FormDialog
      title="Are you sure you want to delete this account group?"
      opened={isOpen}
      onClose={onClose}
      size="md"
      action={`/${accountBook.id}/account-groups/delete`}
    >
      <input type="hidden" name="accountGroupId" value={accountGroupId} />
      <Group justify="end">
        <CancelButton />
        <DeleteButton />
      </Group>
    </FormDialog>
  );
}
