import {
  Button,
  Group,
  Modal,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconAlertTriangle, IconCheck, IconTrash } from "@tabler/icons-react";
import { type FormEvent, useEffect, useState } from "react";
import { MutationSubmitFeedback } from "@/components/dialogs/mutation-submit-feedback";
import { NarrowPageShell } from "@/components/layout/narrow-page-shell";
import { useDialogSubmitState } from "@/hooks/use-dialog-submit-state";
import { useHydrated } from "@/hooks/use-hydrated";

function showAccountBookDeletedNotification() {
  notifications.show({
    color: "green",
    icon: <IconCheck size={16} />,
    title: "Deleted",
    message: "Account book deleted.",
    withBorder: true,
  });
}

export function isDeleteAccountBookConfirmationMatch(args: {
  confirmationName: string;
  accountBookName: string;
}): boolean {
  return args.confirmationName.trim() === args.accountBookName;
}

function DeleteAccountBookModal(args: {
  opened: boolean;
  accountBookName: string;
  onClose: () => void;
  onConfirm: (values: { confirmationName: string }) => Promise<void>;
  onRefreshConstraints?: () => Promise<void>;
}) {
  const submitState = useDialogSubmitState({
    captureErrors: true,
    onRefreshConstraints: args.onRefreshConstraints,
  });
  const { isSubmitting, runSubmit, clearSubmissionError } = submitState;
  const [confirmationName, setConfirmationName] = useState("");
  const confirmationMatches = isDeleteAccountBookConfirmationMatch({
    confirmationName,
    accountBookName: args.accountBookName,
  });

  useEffect(() => {
    if (!args.opened) {
      setConfirmationName("");
      clearSubmissionError();
    }
  }, [args.opened, clearSubmissionError]);

  const handleClose = () => {
    if (isSubmitting) return;
    args.onClose();
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!confirmationMatches) return;

    clearSubmissionError();
    await runSubmit(async () => {
      await args.onConfirm({ confirmationName });
      showAccountBookDeletedNotification();
    });
  }

  return (
    <Modal
      opened={args.opened}
      onClose={handleClose}
      title="Delete Account Book"
      closeOnEscape={!isSubmitting}
      closeOnClickOutside={!isSubmitting}
      withCloseButton={!isSubmitting}
    >
      <form onSubmit={handleSubmit}>
        <Stack gap="md">
          <Text>
            This will permanently delete the account book{" "}
            <Text component="span" fw={700}>
              {args.accountBookName}
            </Text>{" "}
            and all of its accounts, transactions, bookings, and user access.
          </Text>
          <Text size="sm" c="dimmed">
            Type the account book name to confirm.
          </Text>
          <TextInput
            label="Account Book Name"
            value={confirmationName}
            onChange={(event) => setConfirmationName(event.currentTarget.value)}
            disabled={isSubmitting}
            data-autofocus
          />

          <MutationSubmitFeedback
            state={submitState}
            onRefreshConstraints={args.onRefreshConstraints}
          />

          <Group justify="flex-end">
            <Button
              variant="subtle"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              color="red"
              type="submit"
              loading={isSubmitting}
              disabled={isSubmitting || !confirmationMatches}
              leftSection={<IconTrash size={16} />}
            >
              Delete Account Book
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

export function DangerZonePageView(args: {
  accountBookName: string;
  onDelete: (values: { confirmationName: string }) => Promise<void>;
  onRefreshConstraints?: () => Promise<void>;
}) {
  const isHydrated = useHydrated();
  const [deleteModalOpened, setDeleteModalOpened] = useState(false);

  return (
    <NarrowPageShell>
      <Group justify="space-between" align="flex-start" gap="lg">
        <Stack gap={4}>
          <Group gap="xs">
            <IconAlertTriangle size={18} color="var(--mantine-color-red-6)" />
            <Title order={2}>Danger Zone</Title>
          </Group>
          <Text size="sm" c="dimmed">
            Permanently delete this account book and all data inside it.
          </Text>
        </Stack>
        <Button
          color="red"
          variant="outline"
          leftSection={<IconTrash size={16} />}
          onClick={() => setDeleteModalOpened(true)}
          disabled={!isHydrated}
        >
          Delete Account Book
        </Button>
      </Group>

      <DeleteAccountBookModal
        opened={deleteModalOpened}
        accountBookName={args.accountBookName}
        onClose={() => setDeleteModalOpened(false)}
        onConfirm={args.onDelete}
        onRefreshConstraints={args.onRefreshConstraints}
      />
    </NarrowPageShell>
  );
}
