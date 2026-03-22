import { Button, Container, Stack, Text } from "@mantine/core";
import { createFileRoute, redirect } from "@tanstack/react-router";
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
        <form action="/api/logto/sign-out" method="post">
          <Button type="submit" variant="subtle" px={0}>
            Sign out
          </Button>
        </form>
      </Stack>
    </Container>
  );
}
