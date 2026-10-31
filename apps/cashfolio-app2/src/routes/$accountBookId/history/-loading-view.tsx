import { Button, Group, Stack, Text, Title } from "@mantine/core";
import { PageShell } from "@/components/layout/page-shell";

type HistoryLoadErrorProps = {
  error?: Error;
  onRetry: () => void;
  onRestore?: () => void;
};
export function HistoryLoadError({
  error,
  onRetry,
  onRestore,
}: HistoryLoadErrorProps) {
  if (!error) return null;
  return (
    <Stack gap="xs">
      <Text c="red">{error.message}</Text>
      <Group>
        <Button onClick={onRetry}>Retry History</Button>
        {onRestore && (
          <Button variant="default" onClick={onRestore}>
            Restore Previous View
          </Button>
        )}
      </Group>
    </Stack>
  );
}
export function HistoryLoadingView(props: HistoryLoadErrorProps) {
  return (
    <PageShell>
      <Stack>
        <Title order={2}>History</Title>
        <HistoryLoadError {...props} />
      </Stack>
    </PageShell>
  );
}
