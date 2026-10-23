import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Modal,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconCheck, IconTrash } from "@tabler/icons-react";
import { type FormEvent, useEffect, useState } from "react";
import { useDialogSubmitState } from "@/hooks/use-dialog-submit-state";
import type { AdminUserListItem } from "@/server/admin-users";
import {
  getDeleteConfirmationTarget,
  getIdentityStatusLabel,
  isDeleteUserConfirmationMatch,
} from "./-users-page-utils";

type DeleteUserHandler = (args: {
  userId: string;
  confirmation: string;
}) => Promise<void>;

const TOOLTIP_TRIGGER_STYLE = { display: "inline-flex" } as const;

function showUserDeletedNotification() {
  notifications.show({
    color: "green",
    icon: <IconCheck size={16} />,
    title: "Deleted",
    message: "User deleted.",
    withBorder: true,
  });
}

function getDeleteErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Failed to delete user.";
}

export function DeleteUserAction({
  user,
  onDeleteUser,
}: {
  user: AdminUserListItem;
  onDeleteUser: (user: AdminUserListItem) => void;
}) {
  return (
    <Tooltip
      label={
        user.isCurrentUser
          ? "You cannot delete yourself"
          : user.deletionPending
            ? "Retry Deletion"
            : "Delete"
      }
    >
      <span style={TOOLTIP_TRIGGER_STYLE}>
        <ActionIcon
          aria-label={user.deletionPending ? "Retry Deletion" : "Delete"}
          color="red"
          disabled={user.isCurrentUser}
          onClick={() => onDeleteUser(user)}
          size="sm"
          variant="subtle"
        >
          <IconTrash size={16} />
        </ActionIcon>
      </span>
    </Tooltip>
  );
}

export function DeleteUserModal({
  user,
  onClose,
  onDeleteUser,
}: {
  user: AdminUserListItem | null;
  onClose: () => void;
  onDeleteUser: DeleteUserHandler;
}) {
  const { isSubmitting, runSubmit } = useDialogSubmitState();
  const [confirmation, setConfirmation] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const opened = user !== null;
  const confirmationTarget = user ? getDeleteConfirmationTarget(user) : "";
  const confirmationMatches = user
    ? isDeleteUserConfirmationMatch({ confirmation, user })
    : false;
  const identityStatusLabel = user
    ? getIdentityStatusLabel(user.identityStatus)
    : null;

  useEffect(() => {
    if (!opened) {
      setConfirmation("");
      setSubmitError(null);
    }
  }, [opened]);

  const handleClose = () => {
    if (isSubmitting) return;
    onClose();
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !confirmationMatches) return;

    setSubmitError(null);
    await runSubmit(async () => {
      try {
        await onDeleteUser({
          userId: user.id,
          confirmation,
        });
        showUserDeletedNotification();
        onClose();
      } catch (error) {
        setSubmitError(getDeleteErrorMessage(error));
      }
    });
  }

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={user?.deletionPending ? "Retry Deletion" : "Delete user"}
      size="md"
      closeOnEscape={!isSubmitting}
      closeOnClickOutside={!isSubmitting}
      withCloseButton={!isSubmitting}
    >
      {user ? (
        <form onSubmit={handleSubmit}>
          <Stack gap="md">
            <Stack gap={4}>
              <Text size="sm" c="dimmed">
                User
              </Text>
              <Text fw={500}>{user.displayName}</Text>
              {user.email ? (
                <Text c="dimmed" size="sm">
                  {user.email}
                </Text>
              ) : null}
              <Text c="dimmed" size="sm">
                External ID: {user.externalId}
              </Text>
              {identityStatusLabel ? (
                <Badge color="gray" size="xs" variant="light">
                  {identityStatusLabel}
                </Badge>
              ) : null}
              <Text c="dimmed" size="sm">
                Account books: {user.accountBookCount}
              </Text>
            </Stack>

            {user.deletionPending ? (
              <Text c="orange" size="sm">
                Deletion has started but has not finished. Retry to complete it.
                Admin access and role changes are unavailable while deletion is
                pending.
              </Text>
            ) : null}
            <Text size="sm">
              This will permanently delete the user from Cashfolio and Logto.
              Account books only linked to this user will be deleted. Shared
              account books will stay available to other users.
            </Text>
            <Text size="sm" c="dimmed">
              Type {user.email ? "the user's email address" : "the external ID"}{" "}
              to confirm.
            </Text>
            <TextInput
              label={user.email ? "Email Address" : "External ID"}
              value={confirmation}
              onChange={(event) => {
                setConfirmation(event.currentTarget.value);
                setSubmitError(null);
              }}
              placeholder={confirmationTarget}
              disabled={isSubmitting}
              data-autofocus
            />

            {submitError ? (
              <Text c="red" size="sm">
                {submitError}
              </Text>
            ) : null}

            <Group justify="flex-end">
              <Button
                variant="default"
                disabled={isSubmitting}
                onClick={handleClose}
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
                {user.deletionPending ? "Retry Deletion" : "Delete user"}
              </Button>
            </Group>
          </Stack>
        </form>
      ) : null}
    </Modal>
  );
}
