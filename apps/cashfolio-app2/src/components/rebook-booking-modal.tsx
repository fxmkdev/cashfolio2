import { Button, Group, Select, Stack, Text } from "@mantine/core";
import { type FormEvent, useEffect, useRef, useState } from "react";

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
  const formRef = useRef<HTMLFormElement>(null);
  const selectedTargetAccountIdRef = useRef<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [targetAccountId, setTargetAccountId] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    selectedTargetAccountIdRef.current = null;
    setTargetAccountId(null);
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

    if (noEligibleAccountReason) return;

    const selectedTargetAccountId =
      targetAccountId ?? selectedTargetAccountIdRef.current;
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
    <form ref={formRef} onSubmit={handleSubmit}>
      <Stack gap="md">
        <Select
          label="Target account"
          placeholder="Select target account"
          searchable
          data={targetAccounts}
          data-autofocus
          value={targetAccountId}
          onChange={(value) => {
            selectedTargetAccountIdRef.current = value;
            setTargetAccountId(value);
            setValidationError(null);
            setSubmitError(null);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;

            const isDropdownOpen =
              event.currentTarget.getAttribute("aria-expanded") === "true";
            if (isDropdownOpen) return;

            event.preventDefault();
            formRef.current?.requestSubmit();
          }}
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
