import { Flex, SegmentedControl } from "@mantine/core";
import type { ReactNode } from "react";
import type { PeriodBreakdownChartOptions } from "./-breakdown-chart-options";
import { BreakdownTable } from "./-breakdown-table";
import {
  ChartTypeSegmentedControl,
  DEFAULT_BREAKDOWN_CHART_TYPE_OPTIONS,
  type ChartTypeOption,
} from "../-selector/-chart-type-segmented-control";
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
  displayDecimals: number;
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
  return value === "expense" || value === "income" || value === "cashFlow";
}

const CASH_FLOW_BREAKDOWN_CHART_TYPE_OPTIONS =
  DEFAULT_BREAKDOWN_CHART_TYPE_OPTIONS.filter(
    (option) => option.value !== "donut",
  ) as readonly ChartTypeOption<BreakdownChartType>[];

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
  displayDecimals,
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
  const effectiveSelectedChartType =
    selectedBreakdown === "cashFlow" && selectedChartType === "donut"
      ? "bar"
      : selectedChartType;
  const isTableView = effectiveSelectedChartType === "table";
  const hasTableBreakdown = breakdownHierarchy.length > 0;
  const chartTypeOptions =
    selectedBreakdown === "cashFlow"
      ? CASH_FLOW_BREAKDOWN_CHART_TYPE_OPTIONS
      : DEFAULT_BREAKDOWN_CHART_TYPE_OPTIONS;

  const controls = (
    <Flex gap="md" wrap="wrap" justify="flex-end">
      <ChartTypeSegmentedControl
        ariaLabel="Breakdown Chart Type"
        value={effectiveSelectedChartType}
        options={chartTypeOptions}
        onChange={onSelectedChartTypeChange}
      />
      <SegmentedControl
        size="sm"
        aria-label="Breakdown Type"
        value={selectedBreakdown}
        onChange={(value) => {
          if (isBreakdownType(value)) {
            onSelectedBreakdownChange(value);
          }
        }}
        data={[
          { label: "Expenses", value: "expense" },
          { label: "Income", value: "income" },
          { label: "Cash Flow", value: "cashFlow" },
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
            displayDecimals={displayDecimals}
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
