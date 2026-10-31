import { Button, Group, Text, Tooltip, VisuallyHidden } from "@mantine/core";
import { useId } from "react";
import type { BulkAccountActions } from "./-use-bulk-account-actions";

export function BulkAccountToolbar({
  actions,
}: {
  actions: BulkAccountActions;
}) {
  const trackingMethodHintId = useId();
  if (!actions.selectedCount) return null;
  return (
    <Group mb="sm" role="toolbar" aria-label="Selected Account Actions">
      <Text size="sm" role="status">
        {actions.selectedCount}{" "}
        {actions.selectedCount === 1 ? "account" : "accounts"} selected
      </Text>
      <Button variant="light" onClick={actions.openAssetClass}>
        Set Asset Class
      </Button>
      <Tooltip
        label="Select at least one currency account to set its tracking method."
        disabled={actions.trackingMethodEligibleCount > 0}
      >
        <span>
          <Button
            variant="light"
            onClick={actions.openTrackingMethod}
            disabled={!actions.trackingMethodEligibleCount}
            aria-describedby={
              !actions.trackingMethodEligibleCount
                ? trackingMethodHintId
                : undefined
            }
          >
            Set Tracking Method
          </Button>
        </span>
      </Tooltip>
      {!actions.trackingMethodEligibleCount && (
        <VisuallyHidden id={trackingMethodHintId}>
          Select at least one currency account to set its tracking method.
        </VisuallyHidden>
      )}
      <Button variant="subtle" onClick={actions.clearSelection}>
        Clear Selection
      </Button>
    </Group>
  );
}
