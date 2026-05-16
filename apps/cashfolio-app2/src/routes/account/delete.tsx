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

type AccountDeleteSearch = {
  deleted?: string;
};

export const Route = createFileRoute("/account/delete")({
  validateSearch: (search: Record<string, unknown>): AccountDeleteSearch => ({
    deleted: search.deleted === "1" ? "1" : undefined,
  }),
  loaderDeps: ({ search }) => ({ deleted: search.deleted }),
  loader: async ({ deps }) => {
    if (deps.deleted === "1") {
      return {
        deleted: true,
        preview: null,
      };
    }

    const { getAccountDeletionPreview } =
      await import("@/server/account-deletion");

    return {
      deleted: false,
      preview: await getAccountDeletionPreview(),
    };
  },
  head: () => createDocumentTitleHead("Delete Account"),
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleAccountDeletionRequest } =
          await import("@/server/account-deletion");
        return handleAccountDeletionRequest(request);
      },
    },
  },
  component: AccountDeletePage,
});

function AccountDeletePage() {
  const { deleted, preview } = Route.useLoaderData();

  if (deleted) {
    return <AccountDeletedPage />;
  }

  if (!preview) {
    return null;
  }

  return (
    <Container size="sm" py="xl">
      <Stack gap="lg">
        <Title order={1}>Delete Account</Title>
        <Text c="dimmed">
          This permanently deletes {preview.displayName} from Cashfolio and
          Logto.
        </Text>

        <Alert
          color="red"
          icon={<IconAlertTriangle size={18} />}
          title="This cannot be undone"
          variant="light"
        >
          Account books only linked to this user will be deleted. Account books
          shared with other users will stay available to them.
        </Alert>

        <Stack gap="xs">
          <Title order={2} size="h3">
            Account books to delete
          </Title>
          <AccountBookList
            accountBooks={preview.accountBooksToDelete}
            emptyText="No account books will be deleted."
          />
        </Stack>

        <Stack gap="xs">
          <Title order={2} size="h3">
            Account books to leave shared
          </Title>
          <AccountBookList
            accountBooks={preview.accountBooksToUnlink}
            emptyText="No shared account books will be kept."
          />
        </Stack>

        <Divider />

        <form action="/account/delete" method="post">
          <Group justify="end">
            <Button
              color="red"
              leftSection={<IconTrash size={16} />}
              type="submit"
            >
              Delete my account
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

function AccountDeletedPage() {
  return (
    <Container size="sm" py="xl">
      <Stack gap="lg">
        <Group gap="sm">
          <IconCheck size={28} />
          <Title order={1}>Account Deleted</Title>
        </Group>
        <Text c="dimmed">
          Your Cashfolio account and associated Logto account have been deleted.
        </Text>
      </Stack>
    </Container>
  );
}
