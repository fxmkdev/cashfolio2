import { MutationSubmitFeedback } from "./mutation-submit-feedback";
import { Button, Group, Modal, Text } from "@mantine/core";
import type { ReactNode, FormEvent } from "react";
import { useDialogSubmitState } from "../../hooks/use-dialog-submit-state";

export function ConfirmDeleteModal({
  opened,
  onClose,
  title,
  name,
  description,
  onConfirm,
  onRefreshConstraints,
  formatErrorMessage,
  onExitTransitionEnd,
}: {
  opened: boolean;
  onClose: () => void;
  onRefreshConstraints?: () => Promise<void>;
  formatErrorMessage?: (message: string) => string;
  title: string;
  name?: string;
  description?: ReactNode;
  onConfirm: () => void | Promise<void>;
  onExitTransitionEnd?: () => void;
}) {
  const submitState = useDialogSubmitState({
    captureErrors: true,
    formatErrorMessage,
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
      onExitTransitionEnd={onExitTransitionEnd}
      onClose={handleClose}
      title={title}
      closeOnEscape={!isSubmitting}
      closeOnClickOutside={!isSubmitting}
      withCloseButton={!isSubmitting}
    >
      <form onSubmit={handleSubmit}>
        <Text mb="lg">Are you sure you want to delete {name}?</Text>
        {description && (
          <Text mb="lg" size="sm">
            {description}
          </Text>
        )}
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
