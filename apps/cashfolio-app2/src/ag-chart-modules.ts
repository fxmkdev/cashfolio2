import {
  BarSeriesModule,
  CartesianChartModule,
  CategoryAxisModule,
  DonutSeriesModule,
  LegendModule,
  LineSeriesModule,
  ModuleRegistry,
  NumberAxisModule,
  TimeAxisModule,
  PolarChartModule,
} from "ag-charts-community";

let chartModulesRegistered = false;

const CHART_MODULES = [
  CartesianChartModule,
  LegendModule,
  BarSeriesModule,
  LineSeriesModule,
  CategoryAxisModule,
  TimeAxisModule,
  NumberAxisModule,
  PolarChartModule,
  DonutSeriesModule,
];

export function ensureChartModulesRegistered() {
  if (chartModulesRegistered) {
    return;
  }

  ModuleRegistry.registerModules(CHART_MODULES);
  chartModulesRegistered = true;
}
