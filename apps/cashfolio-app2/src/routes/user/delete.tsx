import {
  Alert,
  Button,
  Container,
  Divider,
  Group,
  List,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { createFileRoute } from "@tanstack/react-router";
import { IconAlertTriangle, IconCheck, IconTrash } from "@tabler/icons-react";
import { createDocumentTitleHead } from "@/shared/document-title";

type UserDeleteSearch = {
  deleted?: string;
};

export const Route = createFileRoute("/user/delete")({
  validateSearch: (search: Record<string, unknown>): UserDeleteSearch => ({
    deleted: search.deleted === "1" || search.deleted === 1 ? "1" : undefined,
  }),
  loaderDeps: ({ search }) => ({ deleted: search.deleted }),
  loader: async ({ deps }) => {
    if (deps.deleted === "1") {
      return {
        deleted: true,
        preview: null,
      };
    }

    const { getUserDeletionPreview } = await import("@/server/user-deletion");

    return {
      deleted: false,
      preview: await getUserDeletionPreview(),
    };
  },
  head: () => createDocumentTitleHead("Delete Your Cashfolio Account"),
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleUserDeletionRequest } =
          await import("@/server/user-deletion");
        return handleUserDeletionRequest(request);
      },
    },
  },
  component: UserDeletePage,
});

function UserDeletePage() {
  const { deleted, preview } = Route.useLoaderData();

  if (deleted) {
    return <UserDeletedPage />;
  }

  if (!preview) {
    return null;
  }

  return (
    <Container size="sm" py="xl">
      <Stack gap="lg">
        <Title order={1}>Delete Your Cashfolio Account</Title>
        <Text c="dimmed">
          This permanently deletes your Cashfolio account ({preview.displayName}
          ) and sign-in access.
        </Text>

        <Alert
          color="red"
          icon={<IconAlertTriangle size={18} />}
          title="This cannot be undone"
          variant="light"
        >
          Account books only you can access will also be deleted. Shared account
          books will remain available to other users.
        </Alert>

        <Stack gap="xs">
          <Title order={2} size="h3">
            Account Books to Delete
          </Title>
          <AccountBookList
            accountBooks={preview.accountBooksToDelete}
            emptyText="No account books will be deleted."
          />
        </Stack>

        <Stack gap="xs">
          <Title order={2} size="h3">
            Account Books to Leave Shared
          </Title>
          <AccountBookList
            accountBooks={preview.accountBooksToUnlink}
            emptyText="No shared account books will be kept."
          />
        </Stack>

        <Divider />

        <form action="/user/delete" method="post">
          <Group justify="end">
            <Button
              color="red"
              leftSection={<IconTrash size={16} />}
              type="submit"
            >
              Delete My Cashfolio Account
            </Button>
          </Group>
        </form>
      </Stack>
    </Container>
  );
}

function AccountBookList({
  accountBooks,
  emptyText,
}: {
  accountBooks: { id: string; name: string }[];
  emptyText: string;
}) {
  if (accountBooks.length === 0) {
    return (
      <Text c="dimmed" size="sm">
        {emptyText}
      </Text>
    );
  }

  return (
    <List spacing="xs">
      {accountBooks.map((accountBook) => (
        <List.Item key={accountBook.id}>{accountBook.name}</List.Item>
      ))}
    </List>
  );
}

function UserDeletedPage() {
  return (
    <Container size="sm" py="xl">
      <Stack gap="lg">
        <Group gap="sm">
          <IconCheck size={28} />
          <Title order={1}>Cashfolio account deleted</Title>
        </Group>
        <Text c="dimmed">
          Your Cashfolio account and sign-in access have been deleted.
        </Text>
      </Stack>
    </Container>
  );
}
