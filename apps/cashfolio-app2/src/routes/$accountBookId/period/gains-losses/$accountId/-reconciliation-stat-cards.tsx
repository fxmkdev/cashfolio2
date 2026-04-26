import { Card, SimpleGrid, Stack, Text } from "@mantine/core";
import { ExactValueTooltip } from "@/components/exact-value-tooltip";
import type { PeriodGainLossReconciliation } from "@/server/period-gain-loss-reconciliation";
import { formatExactNumberWithFormatter } from "@/shared/exact-value-format";

function StatCard(args: {
  label: string;
  value: string;
  exactValue?: string;
  valueColor: "green" | "red";
}) {
  return (
    <Card withBorder radius="md" p="lg">
      <Stack gap={4} align="center">
        <Text c="dimmed" fw={600} ta="center">
          {args.label}
        </Text>
        <ExactValueTooltip label={args.exactValue}>
          <Text fw={700} fz="xl" c={args.valueColor}>
            {args.value}
          </Text>
        </ExactValueTooltip>
      </Stack>
    </Card>
  );
}

export function ReconciliationStatCards(args: {
  summary: PeriodGainLossReconciliation["summary"];
  summaryRaw: PeriodGainLossReconciliation["summaryRaw"];
  currencyFormatter: Intl.NumberFormat;
}) {
  return (
    <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="lg">
      <StatCard
        label="Realised"
        value={args.currencyFormatter.format(args.summary.realizedGainLoss)}
        exactValue={formatExactNumberWithFormatter({
          formatter: args.currencyFormatter,
          value: args.summaryRaw.realizedGainLoss,
        })}
        valueColor={args.summary.realizedGainLoss >= 0 ? "green" : "red"}
      />
      <StatCard
        label="Unrealised"
        value={args.currencyFormatter.format(args.summary.unrealizedGainLoss)}
        exactValue={formatExactNumberWithFormatter({
          formatter: args.currencyFormatter,
          value: args.summaryRaw.unrealizedGainLoss,
        })}
        valueColor={args.summary.unrealizedGainLoss >= 0 ? "green" : "red"}
      />
      <StatCard
        label="Total"
        value={args.currencyFormatter.format(args.summary.totalGainLoss)}
        exactValue={formatExactNumberWithFormatter({
          formatter: args.currencyFormatter,
          value: args.summaryRaw.totalGainLoss,
        })}
        valueColor={args.summary.totalGainLoss >= 0 ? "green" : "red"}
      />
    </SimpleGrid>
  );
}
