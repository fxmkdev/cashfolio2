import { MutationSubmitFeedback } from "./mutation-submit-feedback";
import { Button, Group, Stack, Text } from "@mantine/core";
import { type FormEvent, useRef, useState } from "react";
import { useDialogSubmitState } from "../hooks/use-dialog-submit-state";
import {
  AccountTreeSelect,
  type AccountTreeOption,
} from "./account-tree-select";

export type RebookTargetOption = AccountTreeOption;

export function RebookBookingModal({
  targetAccounts,
  disabledReason,
  description,
  onClose,
  onSubmittingChange,
  onSubmit,
  onRefreshConstraints,
}: {
  targetAccounts: RebookTargetOption[];
  disabledReason?: string | null;
  description?: string;
  onClose: () => void;
  onRefreshConstraints?: () => Promise<void>;
  onSubmittingChange?: (isSubmitting: boolean) => void;
  onSubmit: (values: { targetAccountId: string }) => Promise<void>;
}) {
  const submitState = useDialogSubmitState({
    onSubmittingChange,
    captureErrors: true,
    onRefreshConstraints,
  });
  const { isSubmitting, runSubmit } = submitState;
  const formRef = useRef<HTMLFormElement>(null);
  const selectedTargetAccountIdRef = useRef<string | null>(null);
  const [targetAccountId, setTargetAccountId] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const noEligibleAccountReason =
    disabledReason ??
    (targetAccounts.length === 0
      ? "No eligible target account is available."
      : null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (noEligibleAccountReason) return;

    const selectedTargetAccountId =
      targetAccountId ?? selectedTargetAccountIdRef.current;
    if (
      !selectedTargetAccountId ||
      !targetAccounts.some(
        (account) => account.value === selectedTargetAccountId,
      )
    ) {
      setValidationError(
        selectedTargetAccountId
          ? "The selected account is no longer available. Choose another account."
          : "Target account is required",
      );
      return;
    }

    setValidationError(null);
    submitState.clearSubmissionError();

    await runSubmit(async () => {
      await onSubmit({ targetAccountId: selectedTargetAccountId });
    });
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit}>
      <Stack gap="md">
        {description && <Text size="sm">{description}</Text>}
        <AccountTreeSelect
          label="Target Account"
          placeholder="Select Target Account"
          accounts={targetAccounts}
          data-autofocus
          value={targetAccountId}
          onChange={(value) => {
            selectedTargetAccountIdRef.current = value;
            setTargetAccountId(value);
            setValidationError(null);
            submitState.clearSubmissionError();
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;

            const isDropdownOpen =
              event.currentTarget.getAttribute("aria-expanded") === "true";
            if (isDropdownOpen) return;

            event.preventDefault();
            formRef.current?.requestSubmit();
          }}
          disabled={isSubmitting || !!noEligibleAccountReason}
        />

        {validationError && (
          <Text size="sm" c="red">
            {validationError}
          </Text>
        )}

        {noEligibleAccountReason && (
          <Text size="sm" c="dimmed">
            {noEligibleAccountReason}
          </Text>
        )}

        <MutationSubmitFeedback
          state={submitState}
          onRefreshConstraints={onRefreshConstraints}
        />

        <Group justify="end">
          <Button variant="subtle" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            loading={isSubmitting}
            disabled={isSubmitting || !!noEligibleAccountReason}
          >
            Rebook
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
