import { Button, Group, Modal, Text } from "@mantine/core";

export function StatementImportDiscardModal({
  opened,
  action,
  onClose,
  onConfirm,
}: {
  opened: boolean;
  action: "upload" | "leave";
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Discard reviewed statement?"
    >
      <Text mb="lg">
        {action === "upload"
          ? "Going back to Upload will clear the current statement review."
          : "Leaving this page will clear the current statement review."}{" "}
        Unsaved changes will be lost.
      </Text>
      <Group justify="flex-end">
        <Button variant="subtle" onClick={onClose}>
          Keep reviewing
        </Button>
        <Button color="red" onClick={onConfirm}>
          {action === "upload"
            ? "Discard and upload another file"
            : "Discard and leave"}
        </Button>
      </Group>
    </Modal>
  );
}
