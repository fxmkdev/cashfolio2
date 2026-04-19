import {
  Alert,
  Breadcrumbs,
  Button,
  Card,
  Group,
  Stack,
  Text,
  Title,
  UnstyledButton,
} from "@mantine/core";
import { IconAlertTriangle, IconArrowUp } from "@tabler/icons-react";
import { AgCharts } from "ag-charts-react";
import type { ReactNode } from "react";
import type { PeriodBreakdownChartOptions } from "./-breakdown-chart-options";
import type { BreakdownBreadcrumb } from "./-breakdown-drill";
import classes from "./-page-view.module.css";

type DrilldownCardShellProps = {
  title: string;
  subtitle: string;
  breadcrumbs: BreakdownBreadcrumb[];
  clampedPath: string[];
  hasAmountDiscrepancy: boolean;
  hasData: boolean;
  emptyMessage: string;
  chartOptions: PeriodBreakdownChartOptions;
  chartContainerTestId?: string;
  onDrillPathChange: (nextPath: string[]) => void;
  onChartContainerDoubleClick?: (() => void) | null;
  headerControls?: ReactNode;
  footer?: ReactNode;
  drillHint?: string;
};

export function DrilldownCardShell({
  title,
  subtitle,
  breadcrumbs,
  clampedPath,
  hasAmountDiscrepancy,
  hasData,
  emptyMessage,
  chartOptions,
  chartContainerTestId,
  onDrillPathChange,
  onChartContainerDoubleClick,
  headerControls,
  footer,
  drillHint = "Double-click a group to drill down.",
}: DrilldownCardShellProps) {
  return (
    <Card withBorder radius="md" p="md">
      <Stack gap="sm">
        <Group justify="space-between" align="center">
          <Title order={4}>{title}</Title>
          {headerControls}
        </Group>

        <Text c="dimmed" size="sm">
          {subtitle}
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
            {drillHint}
          </Text>
        </Group>

        {hasAmountDiscrepancy ? (
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

        {hasData ? (
          <div
            className={classes.chartContainer}
            data-testid={chartContainerTestId}
            onDoubleClick={onChartContainerDoubleClick ?? undefined}
          >
            <AgCharts options={chartOptions} />
          </div>
        ) : (
          <Text c="dimmed" mt="md">
            {emptyMessage}
          </Text>
        )}
      </Stack>
      {footer}
    </Card>
  );
}
