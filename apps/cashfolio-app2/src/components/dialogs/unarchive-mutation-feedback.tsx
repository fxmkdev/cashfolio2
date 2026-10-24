import { Stack, Text } from "@mantine/core";
import type { useUnarchiveMutation } from "../../hooks/use-unarchive-mutation";
import { MutationSubmitFeedback } from "./mutation-submit-feedback";

export function UnarchiveMutationFeedback({
  recovery,
  onRefreshConstraints,
  listLabel = "account list",
}: {
  listLabel?: string;
  recovery?: ReturnType<typeof useUnarchiveMutation>;
  onRefreshConstraints?: () => Promise<void>;
}) {
  if (!recovery?.target) return null;
  return (
    <Stack gap="xs">
      <Text size="sm">Unarchive {recovery.target.name}</Text>
      <MutationSubmitFeedback
        state={recovery.submitState}
        onRefreshConstraints={onRefreshConstraints}
        onRetry={recovery.retry}
        retryDisabled={recovery.retryDisabled}
      />
      {recovery.submitState.submissionError && recovery.retryDisabled && (
        <Text size="sm">
          This item is no longer eligible to unarchive. Check the refreshed{" "}
          {listLabel}.
        </Text>
      )}
    </Stack>
  );
}
