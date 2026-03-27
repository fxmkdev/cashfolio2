import {
  BarSeriesModule,
  CartesianChartModule,
  CategoryAxisModule,
  LegendModule,
  LineSeriesModule,
  ModuleRegistry,
  NumberAxisModule,
} from "ag-charts-community";

let chartModulesRegistered = false;

const CHART_MODULES = [
  CartesianChartModule,
  LegendModule,
  BarSeriesModule,
  LineSeriesModule,
  CategoryAxisModule,
  NumberAxisModule,
];

export function ensureChartModulesRegistered() {
  if (chartModulesRegistered) {
    return;
  }

  ModuleRegistry.registerModules(CHART_MODULES);
  chartModulesRegistered = true;
}
