import { SegmentedControl } from "@mantine/core";
import type { ReactNode } from "react";
import type { PeriodBreakdownChartOptions } from "./-breakdown-chart-options";
import type { BreakdownBreadcrumb } from "./-breakdown-drill";
import type { AllocationBreakdownType } from "./-breakdown-types";
import { DrilldownCardShell } from "./-drilldown-card-shell";

type PeriodAllocationBreakdownCardProps = {
  selectedBreakdown: AllocationBreakdownType;
  breakdownTitle: string;
  breakdownSubtitle: string;
  breadcrumbs: BreakdownBreadcrumb[];
  clampedPath: string[];
  hasBreakdownAmountDiscrepancy: boolean;
  hasBreakdown: boolean;
  emptyBreakdownMessage: string;
  chartOptions: PeriodBreakdownChartOptions;
  onSelectedBreakdownChange: (value: AllocationBreakdownType) => void;
  onDrillPathChange: (nextPath: string[]) => void;
  footer?: ReactNode;
};

function isAllocationBreakdownType(
  value: string,
): value is AllocationBreakdownType {
  return value === "asset" || value === "liability";
}

export function PeriodAllocationBreakdownCard({
  selectedBreakdown,
  breakdownTitle,
  breakdownSubtitle,
  breadcrumbs,
  clampedPath,
  hasBreakdownAmountDiscrepancy,
  hasBreakdown,
  emptyBreakdownMessage,
  chartOptions,
  onSelectedBreakdownChange,
  onDrillPathChange,
  footer,
}: PeriodAllocationBreakdownCardProps) {
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
      onDrillPathChange={onDrillPathChange}
      headerControls={
        <SegmentedControl
          size="sm"
          aria-label="Allocation type"
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
      }
      footer={footer}
    />
  );
}
