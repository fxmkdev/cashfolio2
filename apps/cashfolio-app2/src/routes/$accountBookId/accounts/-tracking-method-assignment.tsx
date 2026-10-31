import { Button, Group, Modal, Stack, Text } from "@mantine/core";
import { useState } from "react";
import type { AccountTrackingMethod } from "@/.prisma-client/enums";
import { TrackingMethodField } from "@/components/account-editor/tracking-method-field";
import { MutationSubmitFeedback } from "@/components/dialogs/mutation-submit-feedback";
import { useDialogSubmitState } from "@/hooks/use-dialog-submit-state";
import type { TrackingMethodBulkActionTarget } from "./-bulk-account-targets";

export function TrackingMethodAssignmentDialog(props: {
  target: TrackingMethodBulkActionTarget;
  onClose: () => void;
  onSubmit: (trackingMethod: AccountTrackingMethod) => Promise<void>;
  onRefreshConstraints?: () => Promise<void>;
}) {
  const [value, setValue] = useState<AccountTrackingMethod | null>(null);
  const state = useDialogSubmitState({
    captureErrors: true,
    onRefreshConstraints: props.onRefreshConstraints,
  });
  const count = props.target.accountIds.length;
  return (
    <Modal
      opened
      onClose={() => {
        if (!state.isSubmitting) props.onClose();
      }}
      title="Set Tracking Method"
      closeOnEscape={!state.isSubmitting}
      closeOnClickOutside={!state.isSubmitting}
      withCloseButton={!state.isSubmitting}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (value === null) return;
          void state.runSubmit(() => props.onSubmit(value));
        }}
      >
        <Stack>
          <Text size="sm">
            Update {count} currency {count === 1 ? "account" : "accounts"} (
            {props.target.archivedCount} archived).
          </Text>
          {props.target.skippedCount > 0 && (
            <Text size="sm">
              {props.target.skippedCount} selected non-currency{" "}
              {props.target.skippedCount === 1
                ? "account will"
                : "accounts will"}{" "}
              be skipped.
            </Text>
          )}
          <Text size="sm">
            This replaces existing tracking methods and applies to all
            historical periods in Report and History.
          </Text>
          <TrackingMethodField
            openOnFocus={false}
            placeholder="Select tracking method"
            value={value}
            onChange={(next) => {
              setValue(next as AccountTrackingMethod | null);
              state.clearSubmissionError();
            }}
            disabled={state.isSubmitting}
            data-autofocus
          />
          <MutationSubmitFeedback
            state={state}
            onRefreshConstraints={props.onRefreshConstraints}
            retryDisabled={value === null}
          />
          <Group justify="end">
            <Button
              variant="subtle"
              onClick={props.onClose}
              disabled={state.isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              loading={state.isSubmitting}
              disabled={
                value === null || state.isSubmitting || state.isRefreshing
              }
            >
              Apply
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
