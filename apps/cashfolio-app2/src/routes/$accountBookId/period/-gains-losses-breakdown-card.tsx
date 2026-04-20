import type { AgCartesianChartOptions } from "ag-charts-community";
import type { BreakdownBreadcrumb } from "./-breakdown-drill";
import { DrilldownCardShell } from "./-drilldown-card-shell";

type PeriodGainsLossesBreakdownCardProps = {
  title: string;
  subtitle: string;
  breadcrumbs: BreakdownBreadcrumb[];
  clampedPath: string[];
  hasBreakdown: boolean;
  emptyBreakdownMessage: string;
  chartOptions: AgCartesianChartOptions;
  onDrillPathChange: (nextPath: string[]) => void;
};

export function PeriodGainsLossesBreakdownCard({
  title,
  subtitle,
  breadcrumbs,
  clampedPath,
  hasBreakdown,
  emptyBreakdownMessage,
  chartOptions,
  onDrillPathChange,
}: PeriodGainsLossesBreakdownCardProps) {
  return (
    <DrilldownCardShell
      title={title}
      subtitle={subtitle}
      breadcrumbs={breadcrumbs}
      clampedPath={clampedPath}
      hasAmountDiscrepancy={false}
      hasData={hasBreakdown}
      emptyMessage={emptyBreakdownMessage}
      displayMode="chart"
      chartOptions={chartOptions}
      chartContainerTestId="period-gains-losses-breakdown-chart"
      onDrillPathChange={onDrillPathChange}
      drillHint="Double-click a unit to drill down."
    />
  );
}
