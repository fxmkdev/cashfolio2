import { Button, Center, Stack, Text, Title } from "@mantine/core";
import type { ErrorComponentProps } from "@tanstack/react-router";

export function AdminRouteErrorComponent({ error }: ErrorComponentProps) {
  const isForbiddenResponse = getErrorStatus(error) === 403;

  if (!isForbiddenResponse) {
    return (
      <AdminRouteErrorPage
        title="Admin area unavailable"
        message="The Admin area could not be loaded. Please try again from the app."
      />
    );
  }

  return (
    <AdminRouteErrorPage
      title="Admin access required"
      message="Your account is not authorized to access the Admin area."
    />
  );
}

function getErrorStatus(error: unknown): number | null {
  if (error instanceof Response) {
    return error.status;
  }

  if (typeof error !== "object" || error === null) {
    return null;
  }

  const data = error as Record<string, unknown>;
  if (typeof data.status === "number") return data.status;
  if (typeof data.statusCode === "number") return data.statusCode;

  return null;
}

function AdminRouteErrorPage({
  message,
  title,
}: {
  message: string;
  title: string;
}) {
  return (
    <Center mih="100dvh" p="xl">
      <Stack align="center" gap="md" maw={420}>
        <Title order={1} ta="center">
          {title}
        </Title>
        <Text c="dimmed" ta="center">
          {message}
        </Text>
        <Button component="a" href="/">
          Go to App
        </Button>
      </Stack>
    </Center>
  );
}
