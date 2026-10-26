import { Button, Group, Text } from "@mantine/core";
import type { BulkAccountActions } from "./-use-bulk-account-actions";

export function BulkAccountToolbar({
  actions,
}: {
  actions: BulkAccountActions;
}) {
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
      <Button variant="subtle" onClick={actions.clearSelection}>
        Clear Selection
      </Button>
    </Group>
  );
}
