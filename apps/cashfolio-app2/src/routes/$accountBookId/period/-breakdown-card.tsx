import { Flex, SegmentedControl } from "@mantine/core";
import type { ReactNode } from "react";
import type { PeriodBreakdownChartOptions } from "./-breakdown-chart-options";
import { ChartTypeSegmentedControl } from "./-chart-type-segmented-control";
import type { BreakdownBreadcrumb } from "./-breakdown-drill";
import type { BreakdownChartType, BreakdownType } from "./-breakdown-types";
import { DrilldownCardShell } from "./-drilldown-card-shell";

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
  const controls = (
    <Flex gap="md" wrap="wrap" justify="flex-end">
      <ChartTypeSegmentedControl
        ariaLabel="Breakdown chart type"
        value={selectedChartType}
        onChange={onSelectedChartTypeChange}
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
  );

  return (
    <DrilldownCardShell
      title={breakdownTitle}
      subtitle={breakdownSubtitle}
      breadcrumbs={breadcrumbs}
      clampedPath={clampedPath}
      hasAmountDiscrepancy={hasBreakdownAmountDiscrepancy}
      hasData={hasBreakdown}
      emptyMessage={emptyBreakdownMessage}
      chartOptions={chartOptions}
      chartContainerTestId="period-breakdown-chart"
      onDrillPathChange={onDrillPathChange}
      onChartContainerDoubleClick={onChartContainerDoubleClick}
      drillHint="Double-click a group to drill down, or an account to open ledger."
      headerControls={controls}
      footer={footer}
    />
  );
}
