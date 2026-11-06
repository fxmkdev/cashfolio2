import { Button, Group } from "@mantine/core";
import type { Organizer } from "./use-organizer";

export function OrganizerActions({
  organizer,
  onDone,
}: {
  organizer: Organizer;
  onDone: () => void;
}) {
  return (
    <Group
      justify="flex-end"
      gap="md"
      role="toolbar"
      aria-label="Organize Mode Actions"
    >
      <Button variant="default" disabled={organizer.pending} onClick={onDone}>
        Done
      </Button>
    </Group>
  );
}
