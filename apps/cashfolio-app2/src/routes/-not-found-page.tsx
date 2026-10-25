import { Button, Center, Stack, Text, Title } from "@mantine/core";

export function NotFoundPage() {
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
        <Button component="a" href="/">
          Go to App
        </Button>
      </Stack>
    </Center>
  );
}
