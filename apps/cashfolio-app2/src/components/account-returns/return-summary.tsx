import {
  Alert,
  Button,
  Card,
  Group,
  Loader,
  Stack,
  Title,
} from "@mantine/core";
import { ReturnBasisSelect } from "./return-basis-select";
import { accountReturnBasisLabels } from "@/shared/accounts/account-return-display";
import type {
  AccountReturnBasis,
  AccountReturnResult,
} from "@/shared/accounts/account-returns";
import { ReturnValue } from "./return-values";

export function AccountReturnSummaryView(args: {
  basis?: AccountReturnBasis;
  onBasisChange?: (basis: AccountReturnBasis) => void;
  data?: AccountReturnResult;
  loading: boolean;
  error?: string;
  onRetry: () => void;
  onViewCalculation: () => void;
}) {
  const basis = args.basis ?? "annualized";
  if (args.data && !args.data.applicable) return null;
  return (
    <Card withBorder radius="md" p="md" mb="md">
      <Stack gap="sm">
        <Group justify="space-between">
          <Title order={4}>
            Return Since Start ({accountReturnBasisLabels[basis]})
          </Title>
          {args.onBasisChange && (
            <ReturnBasisSelect value={basis} onChange={args.onBasisChange} />
          )}
          <Button
            size="xs"
            variant="subtle"
            disabled={!args.data}
            onClick={args.onViewCalculation}
          >
            View Return Calculation
          </Button>
        </Group>
        {args.loading ? <Loader size="sm" aria-label="Loading return" /> : null}
        {args.error ? (
          <Alert color="red" title="Return Unavailable">
            {args.error}
            <Button onClick={args.onRetry}>Retry</Button>
          </Alert>
        ) : null}
        {args.data ? <ReturnValue data={args.data} basis={basis} /> : null}
      </Stack>
    </Card>
  );
}
