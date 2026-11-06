import { Button, Checkbox, Group, Text } from "@mantine/core";
import type { OrganizeNodeRef } from "@/shared/account-organize/types";
import type { Organizer } from "./use-organizer";
import styles from "./organizer.module.css";

export function OrganizerToolbar({
  selectedCount,
  roots,
  onMove,
  onClear,
  blocked,
  dragging,
  hint,
  organizer,
  hiddenResults,
  showArchived,
  onVisibility,
}: {
  selectedCount: number;
  roots: OrganizeNodeRef[];
  onMove: () => void;
  onClear: () => void;
  blocked: boolean;
  dragging: boolean;
  hint: string;
  organizer: Pick<Organizer, "pending" | "message" | "submitState">;
  hiddenResults: number;
  showArchived: boolean;
  onVisibility: (value: boolean) => void;
}) {
  const groups = roots.filter(
    (node) => node.nodeType === "accountGroup",
  ).length;
  const accounts = roots.length - groups;
  const status =
    hint ||
    (organizer.pending
      ? organizer.submitState.isWaiting
        ? "Waiting for another change to finish…"
        : "Saving…"
      : organizer.message);
  const instruction =
    status ||
    "Drag to move or reorder. Groups move with all descendants. Changes save automatically.";
  return (
    <Group justify="space-between" mb="sm" className={styles.selectionBar}>
      {selectedCount ? (
        <Group role="toolbar" aria-label="Organize Account Actions" gap="xs">
          <Text size="sm" role="status">
            {groups} {groups === 1 ? "group" : "groups"} and {accounts}{" "}
            {accounts === 1 ? "account" : "accounts"} selected
          </Text>
          <Button
            size="sm"
            disabled={!roots.length || blocked || dragging}
            onClick={onMove}
          >
            Move To…
          </Button>
          <Button
            size="sm"
            variant="subtle"
            disabled={!selectedCount || blocked || dragging}
            onClick={onClear}
          >
            Clear Selection
          </Button>
        </Group>
      ) : (
        <Text
          size="sm"
          c="dimmed"
          flex={1}
          miw={0}
          truncate="end"
          title={instruction}
        >
          {instruction}
        </Text>
      )}
      <Group
        gap="sm"
        wrap="nowrap"
        style={{
          flex: selectedCount ? "1 1 160px" : "0 1 auto",
          minWidth: selectedCount ? 160 : undefined,
          maxWidth: selectedCount ? undefined : "50%",
        }}
      >
        {selectedCount > 0 && (
          <Text
            size="sm"
            c="dimmed"
            role="status"
            flex={1}
            miw={0}
            truncate="end"
            title={status || undefined}
          >
            {status}
          </Text>
        )}
        {hiddenResults > 0 && (
          <Text
            size="sm"
            c="dimmed"
            flex={1}
            miw={0}
            truncate="end"
            title="Affected archived items are hidden. Enable Show Archived to view them."
          >
            Affected archived items are hidden. Enable Show Archived to view
            them.
          </Text>
        )}
        <Checkbox
          label="Show Archived"
          style={{ flexShrink: 0 }}
          checked={showArchived}
          disabled={blocked || dragging}
          onChange={(event) => onVisibility(event.currentTarget.checked)}
        />
      </Group>
    </Group>
  );
}
