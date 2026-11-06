import { MutationSubmitFeedback } from "@/components/dialogs/mutation-submit-feedback";
import type { Organizer } from "./use-organizer";

export function OrganizerMutationFeedback({
  organizer,
}: {
  organizer: Organizer;
}) {
  return (
    <MutationSubmitFeedback
      state={{ ...organizer.submitState, isWaiting: false }}
      onRefreshConstraints={organizer.refresh}
      onRetry={organizer.retry}
      retryDisabled={organizer.retryDisabled}
    />
  );
}
