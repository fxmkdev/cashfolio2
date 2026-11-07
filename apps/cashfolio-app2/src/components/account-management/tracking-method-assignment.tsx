import { Button, Group, Modal, Stack, Text } from "@mantine/core";
import { useState } from "react";
import type { AccountTrackingMethod } from "@/.prisma-client/enums";
import { TrackingMethodField } from "@/components/account-editor/tracking-method-field";
import { MutationSubmitFeedback } from "@/components/dialogs/mutation-submit-feedback";
import { useDialogSubmitState } from "@/hooks/use-dialog-submit-state";
import type { TrackingMethodBulkActionTarget } from "./bulk-account-targets";

type AssignmentProps = {
  target: TrackingMethodBulkActionTarget;
  onClose: () => void;
  onSubmit: (trackingMethod: AccountTrackingMethod) => Promise<void>;
  onRefreshConstraints?: () => Promise<void>;
};
type SubmitState = ReturnType<typeof useDialogSubmitState>;
type FieldProps = {
  value: AccountTrackingMethod | null;
  setValue: (value: AccountTrackingMethod | null) => void;
  state: SubmitState;
};
function AssignmentDescription({ target }: Pick<AssignmentProps, "target">) {
  const count = target.accountIds.length;
  return (
    <>
      <Text size="sm">
        Update {count} currency {count === 1 ? "account" : "accounts"} (
        {target.archivedCount} archived).
      </Text>
      {target.skippedCount > 0 && (
        <Text size="sm">
          {target.skippedCount} selected non-currency{" "}
          {target.skippedCount === 1 ? "account will" : "accounts will"} be
          skipped.
        </Text>
      )}
      <Text size="sm">
        This replaces existing tracking methods and applies to all historical
        periods in Report and History.
      </Text>
    </>
  );
}
function AssignmentField({ value, setValue, state }: FieldProps) {
  return (
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
  );
}
function AssignmentButtons({
  value,
  state,
  onClose,
}: Pick<FieldProps, "value" | "state"> & Pick<AssignmentProps, "onClose">) {
  return (
    <Group justify="end">
      <Button variant="subtle" onClick={onClose} disabled={state.isSubmitting}>
        Cancel
      </Button>
      <Button
        type="submit"
        loading={state.isSubmitting}
        disabled={value === null || state.isSubmitting || state.isRefreshing}
      >
        Apply
      </Button>
    </Group>
  );
}
export function TrackingMethodAssignmentDialog(props: AssignmentProps) {
  const [value, setValue] = useState<AccountTrackingMethod | null>(null);
  const state = useDialogSubmitState({
    captureErrors: true,
    onRefreshConstraints: props.onRefreshConstraints,
  });

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
          <AssignmentDescription target={props.target} />
          <AssignmentField value={value} setValue={setValue} state={state} />
          <MutationSubmitFeedback
            state={state}
            onRefreshConstraints={props.onRefreshConstraints}
            retryDisabled={value === null}
          />

          <AssignmentButtons
            value={value}
            state={state}
            onClose={props.onClose}
          />
        </Stack>
      </form>
    </Modal>
  );
}
