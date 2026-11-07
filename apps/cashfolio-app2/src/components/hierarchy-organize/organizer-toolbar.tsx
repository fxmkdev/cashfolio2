import { Button, Checkbox, Group, Text, Tooltip } from "@mantine/core";
import { bulkLifecycleAvailability } from "./lifecycle";
import type { OrganizeNodeRef } from "@/shared/hierarchy-organize/types";
import type { Organizer } from "./use-organizer";
import styles from "./organizer.module.css";

export function OrganizerToolbar({
  selectedCount,
  selected,
  roots,
  onMove,
  onClear,
  onBulkLifecycle,
  blocked,
  dragging,
  hint,
  organizer,
  hiddenResults,
  showArchived,
  onVisibility,
  supportsArchived = true,
}: {
  selectedCount: number;
  selected: OrganizeNodeRef[];
  onBulkLifecycle: (action: "archive" | "delete") => void;
  roots: OrganizeNodeRef[];
  onMove: () => void;
  onClear: () => void;
  blocked: boolean;
  dragging: boolean;
  hint: string;
  organizer: Pick<
    Organizer,
    | "pending"
    | "message"
    | "submitState"
    | "kind"
    | "snapshot"
    | "supportsBulkLifecycle"
  >;
  hiddenResults: number;
  showArchived: boolean;
  onVisibility: (value: boolean) => void;
  supportsArchived?: boolean;
}) {
  const groups = selected.filter(
    (node) => node.nodeType === "accountGroup",
  ).length;
  const accounts = selected.length - groups;
  const status =
    hint ||
    (organizer.pending
      ? organizer.submitState.isWaiting
        ? "Waiting for another change to finish…"
        : "Saving…"
      : organizer.message);
  const instruction =
    status ||
    (organizer.kind === "assetClasses"
      ? "Drag to move or reorder. Classes move with all descendants. Changes save automatically."
      : "Drag to move or reorder. Groups move with all descendants. Changes save automatically.");
  return (
    <Group justify="space-between" mb="sm" className={styles.selectionBar}>
      {selectedCount ? (
        <Group
          role="toolbar"
          aria-label={`Organize ${organizer.kind === "accounts" ? "Account" : organizer.kind === "categories" ? "Category" : "Asset Class"} Actions`}
          gap="xs"
        >
          <Text size="sm" role="status">
            {organizer.kind === "assetClasses"
              ? `${roots.length} asset ${roots.length === 1 ? "class" : "classes"} selected`
              : `${groups} ${groups === 1 ? "group" : "groups"} and ${accounts} ${organizer.kind === "categories" ? (accounts === 1 ? "category" : "categories") : accounts === 1 ? "account" : "accounts"} selected`}
          </Text>
          <Button
            size="sm"
            disabled={!roots.length || blocked || dragging}
            onClick={onMove}
          >
            Move To…
          </Button>
          {organizer.kind === "accounts" &&
            organizer.supportsBulkLifecycle &&
            (["archive", "delete"] as const).map((action) => {
              const available = bulkLifecycleAvailability(
                organizer.snapshot,
                selected,
                action,
              );
              const label = action === "archive" ? "Archive" : "Delete";
              return (
                <Tooltip key={action} label={available.reason ?? label}>
                  <span>
                    <Button
                      size="sm"
                      variant="light"
                      color={action === "archive" ? "yellow" : "red"}
                      aria-description={available.reason}
                      disabled={!available.enabled || blocked || dragging}
                      onClick={() => onBulkLifecycle(action)}
                    >
                      {label}
                    </Button>
                  </span>
                </Tooltip>
              );
            })}
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
        {supportsArchived && (
          <Checkbox
            label="Show Archived"
            style={{ flexShrink: 0 }}
            checked={showArchived}
            disabled={blocked || dragging}
            onChange={(event) => onVisibility(event.currentTarget.checked)}
          />
        )}
      </Group>
    </Group>
  );
}
