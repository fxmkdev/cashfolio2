import { MutationSubmitFeedback } from "./mutation-submit-feedback";
import { Button, Group, Modal, Text } from "@mantine/core";
import type { FormEvent } from "react";
import { useDialogSubmitState } from "../hooks/use-dialog-submit-state";

export function ConfirmDeleteModal({
  opened,
  onClose,
  title,
  name,
  onConfirm,
  onRefreshConstraints,
}: {
  opened: boolean;
  onClose: () => void;
  onRefreshConstraints?: () => Promise<void>;
  title: string;
  name?: string;
  onConfirm: () => void | Promise<void>;
}) {
  const submitState = useDialogSubmitState({
    captureErrors: true,
    onRefreshConstraints,
  });
  const { isSubmitting, runSubmit } = submitState;
  const handleClose = () => {
    if (isSubmitting) return;
    submitState.clearSubmissionError();
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
        <MutationSubmitFeedback
          state={submitState}
          onRefreshConstraints={onRefreshConstraints}
        />
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
