import {
  Alert,
  Card,
  Center,
  Flex,
  Group,
  SegmentedControl,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import {
  IconAlertTriangle,
  IconChartBar,
  IconChartDonut,
} from "@tabler/icons-react";
import { AgCharts } from "ag-charts-react";
import type {
  AgCartesianChartOptions,
  AgPolarChartOptions,
} from "ag-charts-community";
import classes from "./-period-page-view.module.css";

export type BreakdownType = "expense" | "income";
export type BreakdownChartType = "donut" | "bar";

type PeriodBreakdownCardProps = {
  selectedBreakdown: BreakdownType;
  onSelectedBreakdownChange: (nextValue: BreakdownType) => void;
  selectedChartType: BreakdownChartType;
  onSelectedChartTypeChange: (nextValue: BreakdownChartType) => void;
  breakdownTitle: string;
  breakdownSubtitle: string;
  emptyBreakdownMessage: string;
  hasBreakdown: boolean;
  chartOptions: AgPolarChartOptions | AgCartesianChartOptions;
  skippedBookingsCount: number;
};

export function PeriodBreakdownCard({
  selectedBreakdown,
  onSelectedBreakdownChange,
  selectedChartType,
  onSelectedChartTypeChange,
  breakdownTitle,
  breakdownSubtitle,
  emptyBreakdownMessage,
  hasBreakdown,
  chartOptions,
  skippedBookingsCount,
}: PeriodBreakdownCardProps) {
  return (
    <Card withBorder radius="md" p="lg">
      <Stack gap="sm">
        <Group justify="space-between" align="center">
          <Title order={4}>{breakdownTitle}</Title>
          <Flex gap="md" wrap="wrap" justify="flex-end">
            <SegmentedControl
              size="sm"
              aria-label="Breakdown chart type"
              value={selectedChartType}
              onChange={(value) => {
                if (value === "donut" || value === "bar") {
                  onSelectedChartTypeChange(value);
                }
              }}
              data={[
                {
                  label: (
                    <Center style={{ gap: 6 }}>
                      <IconChartDonut size={16} />
                      Donut
                    </Center>
                  ),
                  value: "donut",
                },
                {
                  label: (
                    <Center style={{ gap: 6 }}>
                      <IconChartBar size={16} />
                      Bar
                    </Center>
                  ),
                  value: "bar",
                },
              ]}
            />
            <SegmentedControl
              size="sm"
              value={selectedBreakdown}
              onChange={(value) => {
                if (value === "expense" || value === "income") {
                  onSelectedBreakdownChange(value);
                }
              }}
              data={[
                { label: "Expense", value: "expense" },
                { label: "Income", value: "income" },
              ]}
            />
          </Flex>
        </Group>
        <Text c="dimmed" size="sm">
          {breakdownSubtitle}
        </Text>

        {hasBreakdown ? (
          <div className={classes.chartContainer}>
            <AgCharts options={chartOptions} />
          </div>
        ) : (
          <Text c="dimmed" mt="md">
            {emptyBreakdownMessage}
          </Text>
        )}
      </Stack>

      {skippedBookingsCount > 0 ? (
        <Alert
          mt="md"
          variant="light"
          color="yellow"
          icon={<IconAlertTriangle size={16} />}
          title="Partial data"
        >
          {skippedBookingsCount} valuation-related item(s) were skipped because
          valuation data was unavailable.
        </Alert>
      ) : null}
    </Card>
  );
}
