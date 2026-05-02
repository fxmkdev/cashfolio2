import {
  AreaSeriesModule,
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
  UnitTimeAxisModule,
} from "ag-charts-community";
import {
  NavigatorModule,
  RangesModule,
  WaterfallSeriesModule,
} from "ag-charts-enterprise";

let chartModulesRegistered = false;

const CHART_MODULES = [
  CartesianChartModule,
  LegendModule,
  AreaSeriesModule,
  BarSeriesModule,
  LineSeriesModule,
  CategoryAxisModule,
  TimeAxisModule,
  UnitTimeAxisModule,
  NumberAxisModule,
  PolarChartModule,
  DonutSeriesModule,
  WaterfallSeriesModule,
  NavigatorModule,
  RangesModule,
];

export function ensureChartModulesRegistered() {
  if (chartModulesRegistered) {
    return;
  }

  ModuleRegistry.registerModules(CHART_MODULES);
  chartModulesRegistered = true;
}
