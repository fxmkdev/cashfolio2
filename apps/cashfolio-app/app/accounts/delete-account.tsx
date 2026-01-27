import { Group } from "@mantine/core";
import { useState } from "react";
import {
  CancelButton,
  DeleteButton,
  FormDialog,
} from "~/platform/forms/form-dialog";

export function useDeleteAccount() {
  const [isOpen, setAlertOpen] = useState(false);
  const [accountId, setAccountId] = useState<string>();

  function onDeleteAccount(accountId: string) {
    setAccountId(accountId);
    setAlertOpen(true);
  }
  return {
    deleteAccountProps: {
      isOpen,
      onClose: () => setAlertOpen(false),
      accountId,
    },
    onDeleteAccount,
  };
}

export function DeleteAccount({
  isOpen,
  onClose,
  accountId,
}: {
  isOpen: boolean;
  onClose: () => void;
  accountId?: string;
}) {
  return (
    <FormDialog
      title="Are you sure you want to delete this account?"
      opened={isOpen}
      onClose={onClose}
      size="md"
      action="/accounts/delete"
    >
      <input type="hidden" name="_action" value="delete" />
      <input type="hidden" name="accountId" value={accountId} />
      <Group justify="end">
        <CancelButton data-autofocus />
        <DeleteButton />
      </Group>
    </FormDialog>
  );
}
