import { MutationSubmitFeedback } from "./mutation-submit-feedback";
import { Button, Group, Modal, Text } from "@mantine/core";
import type { ReactNode, FormEvent } from "react";
import { useDialogSubmitState } from "../../hooks/use-dialog-submit-state";

export function ConfirmDeleteModal({
  opened,
  onClose,
  title,
  name,
  confirmDisabled = false,
  description,
  onConfirm,
  onRefreshConstraints,
  formatErrorMessage,
  onExitTransitionEnd,
  submitState: providedSubmitState,
}: {
  opened: boolean;
  onClose: () => void;
  onRefreshConstraints?: () => Promise<void>;
  formatErrorMessage?: (message: string) => string;
  title: string;
  name?: string;
  confirmDisabled?: boolean;
  description?: ReactNode;
  onConfirm: () => void | Promise<void>;
  onExitTransitionEnd?: () => void;
  submitState?: ReturnType<typeof useDialogSubmitState>;
}) {
  const internalSubmitState = useDialogSubmitState({
    captureErrors: true,
    formatErrorMessage,
    onRefreshConstraints,
  });
  const submitState = providedSubmitState ?? internalSubmitState;
  const { isSubmitting, runSubmit } = submitState;
  const handleClose = () => {
    if (isSubmitting) return;
    submitState.clearSubmissionError();
    onClose();
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (confirmDisabled) return;
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
          retryDisabled={confirmDisabled}
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
            disabled={isSubmitting || confirmDisabled}
          >
            Delete
          </Button>
        </Group>
      </form>
    </Modal>
  );
}
