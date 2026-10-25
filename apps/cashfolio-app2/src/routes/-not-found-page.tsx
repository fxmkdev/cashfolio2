import { Button, Center, Group, Stack, Text, Title } from "@mantine/core";
import { IconLogout2 } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { getAuthenticationStatus } from "@/server/authentication";

export function NotFoundPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    let active = true;
    void getAuthenticationStatus().then(
      (authenticated) => {
        if (active) setIsAuthenticated(authenticated);
      },
      () => {
        // Keep the 404 usable and Sign Out hidden if the session check fails.
      },
    );
    return () => {
      active = false;
    };
  }, []);

  return <NotFoundPageView isAuthenticated={isAuthenticated} />;
}

export function NotFoundPageView({
  isAuthenticated,
}: {
  isAuthenticated: boolean;
}) {
  return (
    <Center mih="100dvh" p="xl">
      <Stack component="main" align="center" gap="md" maw={420}>
        <Text c="dimmed" fz={80} fw={700} lh={1}>
          404
        </Text>
        <Title order={1} ta="center">
          Page Not Found
        </Title>
        <Text c="dimmed" ta="center">
          The page you requested could not be found or is no longer available.
        </Text>
        <Group justify="center" gap="sm">
          <Button component="a" href="/">
            Go to App
          </Button>
          {isAuthenticated && (
            <form action="/api/logto/sign-out" method="post">
              <Button
                type="submit"
                variant="default"
                leftSection={<IconLogout2 size={16} />}
              >
                Sign Out
              </Button>
            </form>
          )}
        </Group>
      </Stack>
    </Center>
  );
}
