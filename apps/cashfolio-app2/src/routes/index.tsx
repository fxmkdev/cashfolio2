import { Anchor, Container, Stack, Text } from "@mantine/core";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { getFirstUserAccountBookId } from "../server/home";

export const Route = createFileRoute("/")({
  loader: async () => {
    const accountBookId = await getFirstUserAccountBookId();

    if (accountBookId) {
      throw redirect({
        to: "/$accountBookId",
        params: { accountBookId },
        search: { tab: "ASSET", mode: "active" },
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
        <Anchor href="/api/logto/sign-out" w="fit-content">
          Sign out
        </Anchor>
      </Stack>
    </Container>
  );
}
