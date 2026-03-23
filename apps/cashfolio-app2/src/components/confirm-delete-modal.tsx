import { Button, Group, Modal, Text } from "@mantine/core";
import type { FormEvent } from "react";
import { useDialogSubmitState } from "../hooks/use-dialog-submit-state";

export function ConfirmDeleteModal({
  opened,
  onClose,
  title,
  name,
  onConfirm,
}: {
  opened: boolean;
  onClose: () => void;
  title: string;
  name?: string;
  onConfirm: () => void | Promise<void>;
}) {
  const { isSubmitting, runSubmit } = useDialogSubmitState();
  const handleClose = () => {
    if (isSubmitting) return;
    onClose();
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runSubmit(async () => {
      await onConfirm();
    });
  }

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={title}
      closeOnEscape={!isSubmitting}
      closeOnClickOutside={!isSubmitting}
      withCloseButton={!isSubmitting}
    >
      <form onSubmit={handleSubmit}>
        <Text mb="lg">Are you sure you want to delete {name}?</Text>
        <Group justify="flex-end">
          <Button
            variant="subtle"
            onClick={handleClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            color="red"
            type="submit"
            loading={isSubmitting}
            disabled={isSubmitting}
          >
            Delete
          </Button>
        </Group>
      </form>
    </Modal>
  );
}
