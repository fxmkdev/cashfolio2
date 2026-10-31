import { Button, Stack, Text, Title } from "@mantine/core";
import { PageShell } from "@/components/layout/page-shell";

type HistoryLoadErrorProps = {
  error?: Error;
  onRetry: () => void;
};
export function HistoryLoadError({ error, onRetry }: HistoryLoadErrorProps) {
  if (!error) return null;
  return (
    <Stack gap="xs">
      <Text c="red">{error.message}</Text>
      <Button onClick={onRetry}>Retry History</Button>
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
