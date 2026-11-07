import {
  Alert,
  Button,
  Card,
  Group,
  Loader,
  Stack,
  Title,
} from "@mantine/core";
import type { AccountReturnResult } from "@/shared/account-returns";
import { ReturnValues } from "./return-values";

export function AccountReturnSummaryView(args: {
  data?: AccountReturnResult;
  loading: boolean;
  error?: string;
  onRetry: () => void;
  onViewCalculation: () => void;
}) {
  if (args.data && !args.data.applicable) return null;
  return (
    <Card withBorder radius="md" p="md" mb="md">
      <Stack gap="sm">
        <Group justify="space-between">
          <Title order={4}>Returns Since Start</Title>
          <Button
            size="xs"
            variant="subtle"
            disabled={!args.data}
            onClick={args.onViewCalculation}
          >
            View Return Calculation
          </Button>
        </Group>
        {args.loading ? (
          <Loader size="sm" aria-label="Loading returns" />
        ) : null}
        {args.error ? (
          <Alert color="red" title="Returns Unavailable">
            {args.error}
            <Button onClick={args.onRetry}>Retry</Button>
          </Alert>
        ) : null}
        {args.data ? <ReturnValues data={args.data} /> : null}
      </Stack>
    </Card>
  );
}
