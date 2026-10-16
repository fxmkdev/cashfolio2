import {
  Alert,
  Button,
  Card,
  Group,
  Loader,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import type {
  AccountGainLossDetails,
  AccountGainLossSummary as Summary,
} from "@/shared/account-gain-loss";
import { formatUtcDateForLocale } from "@/shared/date";
import { useUserLocale } from "@/user-locale-context";
import {
  createDisplayNumberFormatter,
  getCurrencyDecimals,
} from "@/shared/unit-format";

export function GainLossSummaryValues({
  summary,
  referenceCurrency,
}: {
  summary: Summary;
  referenceCurrency: string;
}) {
  const locale = useUserLocale();
  const formatter = createDisplayNumberFormatter({
    locale,
    style: "currency",
    currency: referenceCurrency,
    decimals: getCurrencyDecimals(referenceCurrency),
  });
  return (
    <SimpleGrid cols={3}>
      {(
        [
          ["Total", summary.totalGainLoss],
          ["Realised", summary.realizedGainLoss],
          ["Unrealised", summary.unrealizedGainLoss],
        ] as const
      ).map(([label, amount]) => (
        <Stack key={label} gap={2}>
          <Text size="sm" c="dimmed">
            {label}
          </Text>
          <Text
            fw={700}
            c={
              amount == null || amount === 0
                ? undefined
                : amount > 0
                  ? "green"
                  : "red"
            }
            data-testid={`account-gain-loss-${label.toLowerCase()}`}
          >
            {amount == null ? "—" : formatter.format(amount)}
          </Text>
        </Stack>
      ))}
    </SimpleGrid>
  );
}

export function AccountGainLossSummaryView(args: {
  data?: AccountGainLossDetails;
  loading: boolean;
  error?: string;
  onRetry: () => void;
  onViewCalculation: () => void;
}) {
  const locale = useUserLocale();
  if (args.data && !args.data.applicable) return null;
  return (
    <Card withBorder radius="md" p="md" mb="md">
      <Stack gap="sm">
        <Group justify="space-between">
          <Title order={4}>G/L Since Start</Title>
          <Button
            variant="subtle"
            size="xs"
            disabled={!args.data}
            onClick={args.onViewCalculation}
          >
            View Calculation
          </Button>
        </Group>
        {args.loading ? (
          <Loader size="sm" aria-label="Loading Gain/Loss" />
        ) : null}
        {args.error ? (
          <Alert color="red" title="Gain/Loss Unavailable">
            {args.error}
            <Button variant="subtle" onClick={args.onRetry}>
              Retry
            </Button>
          </Alert>
        ) : null}
        {args.data ? (
          <>
            <Text size="xs" c="dimmed">
              Since{" "}
              {formatUtcDateForLocale(new Date(args.data.startDate), locale)} ·
              As of{" "}
              {formatUtcDateForLocale(new Date(args.data.asOfDate), locale)}
            </Text>
            <GainLossSummaryValues
              summary={args.data.summary}
              referenceCurrency={args.data.referenceCurrency}
            />
            {args.data.diagnostics.length ? (
              <Alert color="yellow" title="Incomplete Gain/Loss">
                {[
                  ...new Set(args.data.diagnostics.map((item) => item.message)),
                ].join(" ")}
              </Alert>
            ) : null}
            <Text size="xs" c="dimmed">
              Calculated holding G/L; excludes explicit G/L bookings and income
              such as dividends and interest. Opening holdings use their
              valuation at book start.
            </Text>
          </>
        ) : null}
      </Stack>
    </Card>
  );
}
