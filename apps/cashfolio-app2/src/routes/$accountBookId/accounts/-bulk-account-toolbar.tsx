import { Button, Group, Stack, Text } from "@mantine/core";
import { useId } from "react";
import type { BulkAccountActions } from "./-use-bulk-account-actions";

export function BulkAccountToolbar({
  actions,
}: {
  actions: BulkAccountActions;
}) {
  const reasonId = useId();
  const { selectedAccountCount, selectedGroupCount } = actions;
  if (!selectedAccountCount && !selectedGroupCount) return null;
  const selectionLabel = [
    selectedGroupCount &&
      `${selectedGroupCount} ${selectedGroupCount === 1 ? "group" : "groups"}`,
    selectedAccountCount &&
      `${selectedAccountCount} ${selectedAccountCount === 1 ? "account" : "accounts"}`,
  ]
    .filter(Boolean)
    .join(" and ");
  return (
    <Stack gap="xs" mb="sm">
      <Group role="toolbar" aria-label="Selected Account Actions">
        <Text size="sm" role="status">
          {selectionLabel} selected
        </Text>
        <Button variant="light" onClick={actions.openAssetClass}>
          Set Asset Class
        </Button>
        {actions.openMove && (
          <Button
            variant="light"
            onClick={actions.openMove}
            disabled={!actions.canMove}
            aria-describedby={!actions.canMove ? reasonId : undefined}
          >
            Move Accounts to Group
          </Button>
        )}
        <Button variant="subtle" onClick={actions.clearSelection}>
          Clear Selection
        </Button>
      </Group>
      {actions.openMove && !actions.canMove && (
        <Text id={reasonId} size="sm" c="dimmed">
          Select only individual accounts to move them.
        </Text>
      )}
    </Stack>
  );
}
