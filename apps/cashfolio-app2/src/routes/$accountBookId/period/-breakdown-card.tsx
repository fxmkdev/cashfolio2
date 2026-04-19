import {
  Alert,
  Breadcrumbs,
  Button,
  Card,
  Center,
  Flex,
  Group,
  SegmentedControl,
  Stack,
  Text,
  Title,
  UnstyledButton,
} from "@mantine/core";
import {
  IconAlertTriangle,
  IconArrowUp,
  IconChartBar,
  IconChartDonut,
} from "@tabler/icons-react";
import { AgCharts } from "ag-charts-react";
import type { ReactNode } from "react";
import type { PeriodBreakdownChartOptions } from "./-breakdown-chart-options";
import type { BreakdownBreadcrumb } from "./-breakdown-drill";
import type { BreakdownChartType, BreakdownType } from "./-breakdown-types";
import classes from "./-page-view.module.css";

type PeriodBreakdownCardProps = {
  selectedBreakdown: BreakdownType;
  selectedChartType: BreakdownChartType;
  breakdownTitle: string;
  breakdownSubtitle: string;
  breadcrumbs: BreakdownBreadcrumb[];
  clampedPath: string[];
  hasBreakdownAmountDiscrepancy: boolean;
  hasBreakdown: boolean;
  emptyBreakdownMessage: string;
  chartOptions: PeriodBreakdownChartOptions;
  onSelectedBreakdownChange: (value: BreakdownType) => void;
  onSelectedChartTypeChange: (value: BreakdownChartType) => void;
  onDrillPathChange: (nextPath: string[]) => void;
  onChartContainerDoubleClick?: (() => void) | null;
  footer?: ReactNode;
};

function isBreakdownChartType(value: string): value is BreakdownChartType {
  return value === "donut" || value === "bar";
}

function isBreakdownType(value: string): value is BreakdownType {
  return value === "expense" || value === "income";
}

export function PeriodBreakdownCard({
  selectedBreakdown,
  selectedChartType,
  breakdownTitle,
  breakdownSubtitle,
  breadcrumbs,
  clampedPath,
  hasBreakdownAmountDiscrepancy,
  hasBreakdown,
  emptyBreakdownMessage,
  chartOptions,
  onSelectedBreakdownChange,
  onSelectedChartTypeChange,
  onDrillPathChange,
  onChartContainerDoubleClick,
  footer,
}: PeriodBreakdownCardProps) {
  return (
    <Card withBorder radius="md" p="md">
      <Stack gap="sm">
        <Group justify="space-between" align="center">
          <Title order={4}>{breakdownTitle}</Title>
          <Flex gap="md" wrap="wrap" justify="flex-end">
            <SegmentedControl
              size="sm"
              aria-label="Breakdown chart type"
              value={selectedChartType}
              onChange={(value) => {
                if (isBreakdownChartType(value)) {
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
              aria-label="Breakdown type"
              value={selectedBreakdown}
              onChange={(value) => {
                if (isBreakdownType(value)) {
                  onSelectedBreakdownChange(value);
                }
              }}
              data={[
                { label: "Expenses", value: "expense" },
                { label: "Income", value: "income" },
              ]}
            />
          </Flex>
        </Group>

        <Text c="dimmed" size="sm">
          {breakdownSubtitle}
        </Text>

        <Group
          justify="space-between"
          align="center"
          gap="xs"
          className={classes.breakdownContextRow}
        >
          <Group gap="xs" wrap="wrap">
            <Button
              variant="default"
              size="compact-sm"
              leftSection={<IconArrowUp size={14} />}
              disabled={clampedPath.length === 0}
              onClick={() => {
                onDrillPathChange(clampedPath.slice(0, clampedPath.length - 1));
              }}
            >
              Up
            </Button>

            <Breadcrumbs>
              {breadcrumbs.map((breadcrumb, breadcrumbIndex) => {
                const isCurrent = breadcrumbIndex === breadcrumbs.length - 1;
                const nextPath =
                  breadcrumb.id == null
                    ? []
                    : clampedPath.slice(0, breadcrumbIndex);

                if (isCurrent) {
                  return (
                    <Text
                      key={breadcrumb.id ?? "root"}
                      fw={600}
                      fz="sm"
                      lh="inherit"
                    >
                      {breadcrumb.label}
                    </Text>
                  );
                }

                return (
                  <UnstyledButton
                    key={breadcrumb.id ?? "root"}
                    className={classes.breadcrumbButton}
                    onClick={() => {
                      onDrillPathChange(nextPath);
                    }}
                  >
                    <Text fz="sm" c="blue.7" lh="inherit">
                      {breadcrumb.label}
                    </Text>
                  </UnstyledButton>
                );
              })}
            </Breadcrumbs>
          </Group>

          <Text c="dimmed" size="xs">
            Double-click a group to drill down, or an account to open ledger.
          </Text>
        </Group>

        {hasBreakdownAmountDiscrepancy ? (
          <Alert
            variant="light"
            color="yellow"
            icon={<IconAlertTriangle size={16} />}
            title="Adjusted totals in this view"
          >
            Hidden non-positive or rounded-to-zero child accounts are excluded
            from drill-down rows. Parent totals can therefore differ slightly
            from the sum of visible children.
          </Alert>
        ) : null}

        {hasBreakdown ? (
          <div
            className={classes.chartContainer}
            data-testid="period-breakdown-chart"
            onDoubleClick={onChartContainerDoubleClick ?? undefined}
          >
            <AgCharts options={chartOptions} />
          </div>
        ) : (
          <Text c="dimmed" mt="md">
            {emptyBreakdownMessage}
          </Text>
        )}
      </Stack>
      {footer}
    </Card>
  );
}
