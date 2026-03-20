import { Button, Group, Modal, Text } from "@mantine/core";

export function ConfirmArchiveModal({
  opened,
  onClose,
  title,
  name,
  onConfirm,
}: {
  opened: boolean;
  onClose: () => void;
  title: string;
  name?: string;
  onConfirm: () => void;
}) {
  return (
    <Modal opened={opened} onClose={onClose} title={title}>
      <Text mb="lg">Are you sure you want to archive {name}?</Text>
      <Group justify="flex-end">
        <Button variant="subtle" onClick={onClose}>
          Cancel
        </Button>
        <Button
          color="yellow"
          onClick={onConfirm}
          data-testid="confirm-archive-button"
        >
          Archive
        </Button>
      </Group>
    </Modal>
  );
}
