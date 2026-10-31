import { Flex, SegmentedControl, Text } from "@mantine/core";
import type { ReactNode } from "react";
import type { PeriodBreakdownChartOptions } from "./-breakdown-chart-options";
import { BreakdownTable } from "./-breakdown-table";
import {
  ChartTypeSegmentedControl,
  DEFAULT_BREAKDOWN_CHART_TYPE_OPTIONS,
} from "../-selector/-chart-type-segmented-control";
import type {
  BreakdownBreadcrumb,
  BreakdownHierarchyNode,
} from "./-breakdown-drill";
import type {
  AllocationBreakdownType,
  BreakdownChartType,
} from "./-breakdown-types";
import { DrilldownCardShell } from "./-drilldown-card-shell";

type PeriodAllocationBreakdownCardProps = {
  totalAmount?: number;
  selectedBreakdown: AllocationBreakdownType;
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
  onSelectedBreakdownChange: (value: AllocationBreakdownType) => void;
  onSelectedChartTypeChange: (value: BreakdownChartType) => void;
  onDrillPathChange: (nextPath: string[]) => void;
  onBreakdownAccountDoubleClick: (accountId: string) => void;
  onChartContainerDoubleClick?: (() => void) | null;
  footer?: ReactNode;
};

function isAllocationBreakdownType(
  value: string,
): value is AllocationBreakdownType {
  return value === "asset" || value === "liability";
}

export function PeriodAllocationBreakdownCard({
  totalAmount,
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
}: PeriodAllocationBreakdownCardProps) {
  const isTableView = selectedChartType === "table";
  const hasTableBreakdown = breakdownHierarchy.length > 0;

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
            key={tableExpandedGroupsStorageKey}
            totalAmount={totalAmount}
            hierarchy={breakdownHierarchy}
            valueHeaderName="Balance"
            displayDecimals={displayDecimals}
            onAccountDoubleClick={onBreakdownAccountDoubleClick}
            expandedGroupsStorageKey={tableExpandedGroupsStorageKey}
          />
        ) : null
      }
      chartContainerTestId="period-allocation-breakdown-chart"
      tableContainerTestId="period-allocation-breakdown-table"
      onDrillPathChange={onDrillPathChange}
      onChartContainerDoubleClick={onChartContainerDoubleClick}
      showDrillControls={!isTableView}
      drillHint="Double-click a group to drill down, or an allocation account to open ledger."
      headerControls={
        <Flex gap="md" wrap="wrap" justify="flex-end">
          <ChartTypeSegmentedControl
            ariaLabel="Allocation Chart Type"
            value={selectedChartType}
            options={DEFAULT_BREAKDOWN_CHART_TYPE_OPTIONS}
            onChange={onSelectedChartTypeChange}
          />
          <SegmentedControl
            size="sm"
            aria-label="Allocation Type"
            value={selectedBreakdown}
            onChange={(value) => {
              if (isAllocationBreakdownType(value)) {
                onSelectedBreakdownChange(value);
              }
            }}
            data={[
              { label: "Assets", value: "asset" },
              { label: "Liabilities", value: "liability" },
            ]}
          />
        </Flex>
      }
      footer={
        <>
          <Text size="sm" c="dimmed" mt="md">
            {selectedBreakdown === "asset"
              ? "Assets include positive account balances at period end, regardless of account type."
              : "Liabilities show amounts owed from negative account balances at period end, regardless of account type."}
          </Text>
          {footer}
        </>
      }
    />
  );
}
