import { Button, Container, Stack, Text } from "@mantine/core";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { IconPlus } from "@tabler/icons-react";
import { LinkButton } from "@/components/link-button";
import { getFirstUserAccountBookId } from "../server/home";

export const Route = createFileRoute("/")({
  loader: async () => {
    const accountBookId = await getFirstUserAccountBookId();

    if (accountBookId) {
      throw redirect({
        to: "/$accountBookId",
        params: { accountBookId },
      });
    }

    return null;
  },
  component: HomePage,
});

function HomePage() {
  return (
    <Container py="xl">
      <Stack gap="md">
        <Text size="lg">There are no account books yet.</Text>
        <LinkButton
          to="/account-books/new"
          leftSection={<IconPlus size={16} />}
          w="fit-content"
        >
          Create account book
        </LinkButton>
        <form action="/api/logto/sign-out" method="post">
          <Button type="submit" variant="subtle" px={0}>
            Sign out
          </Button>
        </form>
      </Stack>
    </Container>
  );
}
