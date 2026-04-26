import { Card, SimpleGrid, Stack, Text } from "@mantine/core";
import { ExactValueTooltip } from "@/components/exact-value-tooltip";

export type StatCardData = {
  id: string;
  label: string;
  value: string;
  exactValue?: string;
  valueColor: "green" | "red";
  secondaryValue?: string;
};

type StatCardProps = Omit<StatCardData, "id"> & {
  testId?: string;
};

function StatCard({
  label,
  value,
  exactValue,
  valueColor,
  secondaryValue,
  testId,
}: StatCardProps) {
  return (
    <Card withBorder radius="md" p="lg" data-testid={testId}>
      <Stack gap={4} align="center">
        <Text c="dimmed" fw={600} ta="center">
          {label}
        </Text>
        <ExactValueTooltip label={exactValue}>
          <Text fw={700} fz="xl" c={valueColor}>
            {value}
          </Text>
        </ExactValueTooltip>
        {secondaryValue ? (
          <Text c="dimmed" fw={500} fz="sm" ta="center">
            {secondaryValue}
          </Text>
        ) : null}
      </Stack>
    </Card>
  );
}

export function PeriodStatsCardsSection(args: {
  statCards: StatCardData[];
  endOfPeriodStatCards: StatCardData[];
}) {
  return (
    <>
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3, xl: 5 }} spacing="lg">
        {args.statCards.map((card) => (
          <StatCard
            key={card.id}
            label={card.label}
            value={card.value}
            exactValue={card.exactValue}
            valueColor={card.valueColor}
            secondaryValue={card.secondaryValue}
            testId={`period-stat-card-${card.id}`}
          />
        ))}
      </SimpleGrid>
      <Stack gap="xs">
        <Text c="dimmed" size="sm" ta="center">
          As of period end (last day)
        </Text>
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="lg">
          {args.endOfPeriodStatCards.map((card) => (
            <StatCard
              key={card.id}
              label={card.label}
              value={card.value}
              exactValue={card.exactValue}
              valueColor={card.valueColor}
            />
          ))}
        </SimpleGrid>
      </Stack>
    </>
  );
}
