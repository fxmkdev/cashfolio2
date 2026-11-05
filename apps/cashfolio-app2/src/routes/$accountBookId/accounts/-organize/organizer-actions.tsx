import { Button, Group } from "@mantine/core";
import { IconArrowBackUp } from "@tabler/icons-react";
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
      {organizer.undo && (
        <Button
          variant="default"
          leftSection={<IconArrowBackUp size={16} />}
          disabled={organizer.blocked}
          onClick={() => void organizer.undoMove()}
        >
          Undo
        </Button>
      )}
      <Button variant="default" disabled={organizer.pending} onClick={onDone}>
        Done
      </Button>
    </Group>
  );
}
