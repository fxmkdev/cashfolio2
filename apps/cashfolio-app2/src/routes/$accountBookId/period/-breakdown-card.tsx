import { Flex, SegmentedControl } from "@mantine/core";
import type { ReactNode } from "react";
import type { PeriodBreakdownChartOptions } from "./-breakdown-chart-options";
import { BreakdownTable } from "./-breakdown-table";
import { ChartTypeSegmentedControl } from "./-chart-type-segmented-control";
import type {
  BreakdownBreadcrumb,
  BreakdownHierarchyNode,
} from "./-breakdown-drill";
import type { BreakdownChartType, BreakdownType } from "./-breakdown-types";
import { DrilldownCardShell } from "./-drilldown-card-shell";

type PeriodBreakdownCardProps = {
  selectedBreakdown: BreakdownType;
  selectedChartType: BreakdownChartType;
  tableExpandedGroupsStorageKey?: string;
  breakdownTitle: string;
  breakdownSubtitle: string;
  breadcrumbs: BreakdownBreadcrumb[];
  clampedPath: string[];
  hasBreakdownAmountDiscrepancy: boolean;
  hasBreakdown: boolean;
  emptyBreakdownMessage: string;
  breakdownHierarchy: BreakdownHierarchyNode[];
  chartOptions: PeriodBreakdownChartOptions;
  onSelectedBreakdownChange: (value: BreakdownType) => void;
  onSelectedChartTypeChange: (value: BreakdownChartType) => void;
  onDrillPathChange: (nextPath: string[]) => void;
  onBreakdownAccountDoubleClick: (accountId: string) => void;
  onChartContainerDoubleClick?: (() => void) | null;
  footer?: ReactNode;
};

function isBreakdownType(value: string): value is BreakdownType {
  return value === "expense" || value === "income";
}

export function PeriodBreakdownCard({
  selectedBreakdown,
  selectedChartType,
  tableExpandedGroupsStorageKey,
  breakdownTitle,
  breakdownSubtitle,
  breadcrumbs,
  clampedPath,
  hasBreakdownAmountDiscrepancy,
  hasBreakdown,
  emptyBreakdownMessage,
  breakdownHierarchy,
  chartOptions,
  onSelectedBreakdownChange,
  onSelectedChartTypeChange,
  onDrillPathChange,
  onBreakdownAccountDoubleClick,
  onChartContainerDoubleClick,
  footer,
}: PeriodBreakdownCardProps) {
  const isTableView = selectedChartType === "table";
  const hasTableBreakdown = breakdownHierarchy.length > 0;

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
      hasData={isTableView ? hasTableBreakdown : hasBreakdown}
      emptyMessage={emptyBreakdownMessage}
      displayMode={isTableView ? "table" : "chart"}
      chartOptions={chartOptions}
      tableContent={
        isTableView ? (
          <BreakdownTable
            hierarchy={breakdownHierarchy}
            valueHeaderName="Amount"
            onAccountDoubleClick={onBreakdownAccountDoubleClick}
            expandedGroupsStorageKey={tableExpandedGroupsStorageKey}
          />
        ) : null
      }
      chartContainerTestId="period-breakdown-chart"
      tableContainerTestId="period-breakdown-table"
      onDrillPathChange={onDrillPathChange}
      onChartContainerDoubleClick={onChartContainerDoubleClick}
      showDrillControls={!isTableView}
      drillHint="Double-click a group to drill down, or an account to open ledger."
      headerControls={controls}
      footer={footer}
    />
  );
}
