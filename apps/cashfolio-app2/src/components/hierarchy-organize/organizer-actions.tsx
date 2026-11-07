import { Button, Group } from "@mantine/core";
import type { Organizer } from "./use-organizer";

export function OrganizerActions({
  organizer,
  onDone,
  blocked = false,
}: {
  organizer: Organizer;
  onDone: () => void;
  blocked?: boolean;
}) {
  return (
    <Group
      justify="flex-end"
      gap="md"
      role="toolbar"
      aria-label="Organize Mode Actions"
    >
      <Button
        variant="default"
        disabled={organizer.pending || blocked}
        onClick={onDone}
      >
        Done
      </Button>
    </Group>
  );
}
