import { Button, Group, Modal, Text } from "@mantine/core";

export function ConfirmDeleteModal({
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
      <Text mb="lg">Are you sure you want to delete {name}?</Text>
      <Group justify="flex-end">
        <Button variant="subtle" onClick={onClose}>
          Cancel
        </Button>
        <Button color="red" onClick={onConfirm}>
          Delete
        </Button>
      </Group>
    </Modal>
  );
}
