import { AgCharts } from "ag-charts-react";
import { ensureChartModulesRegistered } from "@/ag-chart-modules";
import type { useHistoryChartModel } from "./-use-chart-model";
import classes from "./-page-view.module.css";

ensureChartModulesRegistered();

export function HistoryChart({
  chartRef,
  chartOptions,
}: Pick<ReturnType<typeof useHistoryChartModel>, "chartRef" | "chartOptions">) {
  return (
    <AgCharts ref={chartRef} options={chartOptions} className={classes.chart} />
  );
}
