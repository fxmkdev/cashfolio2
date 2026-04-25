import { IconChartBar, IconTable } from "@tabler/icons-react";
import type { AgCartesianChartOptions } from "ag-charts-community";
import type { GainsLossesBreakdownNode } from "./-gains-losses-breakdown-types";
import {
  ChartTypeSegmentedControl,
  type ChartTypeOption,
} from "./-chart-type-segmented-control";
import type { BreakdownBreadcrumb } from "./-breakdown-drill";
import { DrilldownCardShell } from "./-drilldown-card-shell";
import { GainsLossesTable } from "./-gains-losses-table";
import type { GainsLossesChartType } from "./-breakdown-types";

type GainsLossesCardProps = {
  selectedChartType: GainsLossesChartType;
  tableExpandedGroupsStorageKey: string;
  subtitle: string;
  breadcrumbs: BreakdownBreadcrumb[];
  clampedPath: string[];
  hasGainsLosses: boolean;
  emptyMessage: string;
  hierarchy: GainsLossesBreakdownNode[];
  chartOptions: AgCartesianChartOptions;
  onSelectedChartTypeChange: (value: GainsLossesChartType) => void;
  onDrillPathChange: (nextPath: string[]) => void;
  onChartContainerDoubleClick?: (() => void) | null;
};

const GAINS_LOSSES_CHART_TYPE_OPTIONS = [
  {
    value: "waterfall",
    label: "Waterfall",
    icon: <IconChartBar size={16} />,
  },
  {
    value: "table",
    label: "Table",
    icon: <IconTable size={16} />,
  },
] as const satisfies readonly ChartTypeOption<GainsLossesChartType>[];

export function GainsLossesCard({
  selectedChartType,
  tableExpandedGroupsStorageKey,
  subtitle,
  breadcrumbs,
  clampedPath,
  hasGainsLosses,
  emptyMessage,
  hierarchy,
  chartOptions,
  onSelectedChartTypeChange,
  onDrillPathChange,
  onChartContainerDoubleClick,
}: GainsLossesCardProps) {
  const isTableView = selectedChartType === "table";
  const hasTableBreakdown = hierarchy.length > 0;

  return (
    <DrilldownCardShell
      title="Gains / Losses Breakdown"
      subtitle={subtitle}
      breadcrumbs={breadcrumbs}
      clampedPath={clampedPath}
      hasAmountDiscrepancy={false}
      hasData={isTableView ? hasTableBreakdown : hasGainsLosses}
      emptyMessage={emptyMessage}
      displayMode={isTableView ? "table" : "chart"}
      chartOptions={chartOptions}
      tableContent={
        isTableView ? (
          <GainsLossesTable
            hierarchy={hierarchy}
            expandedGroupsStorageKey={tableExpandedGroupsStorageKey}
          />
        ) : null
      }
      chartContainerTestId="period-gains-losses-breakdown-chart"
      tableContainerTestId="period-gains-losses-breakdown-table"
      onDrillPathChange={onDrillPathChange}
      onChartContainerDoubleClick={onChartContainerDoubleClick}
      showDrillControls={!isTableView}
      headerControls={
        <ChartTypeSegmentedControl
          ariaLabel="Gains/losses chart type"
          value={selectedChartType}
          options={GAINS_LOSSES_CHART_TYPE_OPTIONS}
          onChange={onSelectedChartTypeChange}
        />
      }
    />
  );
}
