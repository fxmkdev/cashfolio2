import { Button, Group, Select, Stack, Text } from "@mantine/core";
import { type FormEvent, useEffect, useState } from "react";

export type RebookTargetOption = {
  value: string;
  label: string;
};

export function RebookBookingModal({
  targetAccounts,
  disabledReason,
  onClose,
  onSubmit,
}: {
  targetAccounts: RebookTargetOption[];
  disabledReason?: string | null;
  onClose: () => void;
  onSubmit: (values: { targetAccountId: string }) => Promise<void>;
}) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [targetAccountId, setTargetAccountId] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    setTargetAccountId(targetAccounts[0]?.value ?? null);
    setValidationError(null);
    setSubmitError(null);
  }, [targetAccounts]);

  const noEligibleAccountReason =
    disabledReason ??
    (targetAccounts.length === 0
      ? "No eligible target account is available."
      : null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const selectedTargetAccountId = targetAccountId ?? targetAccounts[0]?.value;
    if (!selectedTargetAccountId) {
      setValidationError("Target account is required");
      return;
    }

    setValidationError(null);
    setSubmitError(null);

    try {
      await onSubmit({ targetAccountId: selectedTargetAccountId });
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "Failed to rebook booking.",
      );
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <Stack gap="md">
        <Select
          label="Target account"
          placeholder="Select target account"
          searchable
          data={targetAccounts}
          value={targetAccountId}
          onChange={setTargetAccountId}
          disabled={!!noEligibleAccountReason}
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

        {submitError && (
          <Text size="sm" c="red">
            {submitError}
          </Text>
        )}

        <Group justify="end">
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!!noEligibleAccountReason}>
            Rebook
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
