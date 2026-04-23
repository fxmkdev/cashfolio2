import { Card, Stack, Text, Title } from "@mantine/core";
import type { GainsLossesBreakdownNode } from "./-gains-losses-breakdown-types";
import { GainsLossesTable } from "./-gains-losses-table";
import classes from "./-page-view.module.css";

type GainsLossesCardProps = {
  accountBookId: string;
  referenceCurrency: string;
  hierarchy: GainsLossesBreakdownNode[];
};

export function GainsLossesCard({
  accountBookId,
  referenceCurrency,
  hierarchy,
}: GainsLossesCardProps) {
  const hasData = hierarchy.length > 0;

  return (
    <Card withBorder radius="md" p="md">
      <Stack gap="sm">
        <Title order={4}>Gains / Losses Breakdown</Title>
        <Text c="dimmed" size="sm">
          By unit type and unit in {referenceCurrency}
        </Text>

        {hasData ? (
          <div
            className={classes.chartContainer}
            data-testid="period-gains-losses-breakdown-table"
          >
            <GainsLossesTable
              hierarchy={hierarchy}
              expandedGroupsStorageKey={`cashfolio:periodExpandedGroups:${accountBookId}:gains-losses`}
            />
          </div>
        ) : (
          <Text c="dimmed" mt="md">
            No gains/losses were found for this period.
          </Text>
        )}
      </Stack>
    </Card>
  );
}
