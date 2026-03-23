import { Button, Group, Modal, Text } from "@mantine/core";
import type { FormEvent } from "react";
import { useDialogSubmitState } from "../hooks/use-dialog-submit-state";

export function ConfirmArchiveModal({
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
        <Text mb="lg">Are you sure you want to archive {name}?</Text>
        <Group justify="flex-end">
          <Button
            variant="subtle"
            onClick={handleClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            color="yellow"
            type="submit"
            loading={isSubmitting}
            disabled={isSubmitting}
          >
            Archive
          </Button>
        </Group>
      </form>
    </Modal>
  );
}
