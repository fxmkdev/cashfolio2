import { IconChartBar, IconTable } from "@tabler/icons-react";
import type { AgCartesianChartOptions } from "ag-charts-community";
import type { GainsLossesBreakdownNode } from "./-gains-losses-breakdown-types";
import type { GainsLossesChartType } from "../-breakdown/-breakdown-types";
import type { BreakdownBreadcrumb } from "../-breakdown/-breakdown-drill";
import {
  ChartTypeSegmentedControl,
  type ChartTypeOption,
} from "../-selector/-chart-type-segmented-control";
import { DrilldownCardShell } from "../-breakdown/-drilldown-card-shell";
import { GainsLossesTable } from "./-gains-losses-table";

type GainsLossesCardProps = {
  selectedChartType: GainsLossesChartType;
  displayDecimals: number;
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
  onExplicitGainLossDoubleClick?: () => void;
  onUnitAccountDoubleClick?: (accountId: string) => void;
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
  displayDecimals,
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
  onExplicitGainLossDoubleClick,
  onUnitAccountDoubleClick,
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
            displayDecimals={displayDecimals}
            expandedGroupsStorageKey={tableExpandedGroupsStorageKey}
            onExplicitGainLossDoubleClick={onExplicitGainLossDoubleClick}
            onUnitAccountDoubleClick={onUnitAccountDoubleClick}
          />
        ) : null
      }
      chartContainerTestId="period-gains-losses-breakdown-chart"
      tableContainerTestId="period-gains-losses-breakdown-table"
      onDrillPathChange={onDrillPathChange}
      onChartContainerDoubleClick={onChartContainerDoubleClick}
      showDrillControls={!isTableView}
      drillHint="Double-click a bar to drill down."
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
