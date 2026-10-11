import { Alert, Button, Group, Text } from "@mantine/core";
import type { useDialogSubmitState } from "../hooks/use-dialog-submit-state";

export function MutationSubmitFeedback({
  state,
  onRefreshConstraints,
  onRetry,
}: {
  state: ReturnType<typeof useDialogSubmitState>;
  onRefreshConstraints?: () => Promise<void>;
  onRetry?: () => void;
}) {
  return (
    <>
      {state.isWaiting && !state.submissionError && (
        <Text size="sm" c="dimmed" role="status">
          Waiting for another change to finish…
        </Text>
      )}
      {state.submissionError && (
        <Alert color="red" role="alert">
          {state.submissionError.message}
        </Alert>
      )}
      {state.refreshError && (
        <Alert color="yellow" role="alert">
          {state.refreshError}
        </Alert>
      )}
      {(state.submissionError || state.refreshError) && (
        <Group>
          {onRefreshConstraints && (
            <Button
              variant="light"
              size="xs"
              loading={state.isRefreshing}
              disabled={state.isSubmitting}
              onClick={() => void state.refreshConstraints()}
            >
              Refresh choices
            </Button>
          )}
          {state.submissionError?.isBusy && (
            <Button
              size="xs"
              type={onRetry ? "button" : "submit"}
              disabled={state.isSubmitting || state.isRefreshing}
              onClick={onRetry}
            >
              Try again
            </Button>
          )}
        </Group>
      )}
    </>
  );
}
