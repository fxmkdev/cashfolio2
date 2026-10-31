import type { MantineTheme } from "@mantine/core";
import type {
  AgSeriesVisibilityChange,
  AgZoomEvent,
} from "ag-charts-community";
import type { DashboardChartThemeColors } from "@/shared/dashboard-chart-theme";
import type { HistoryMetric, HistoryPeriodMode } from "./-page-types";
import type { HistoryChartDatum } from "./-chart-data";

export type HistoryChartOptionsArgs = {
  chartData: HistoryChartDatum[];
  periodMode: HistoryPeriodMode;
  selectedMetric: HistoryMetric;
  selectedMetricSeriesLabel?: string;
  showCumulativeSeries?: boolean;
  amountCompactFormatter: Intl.NumberFormat;
  currencyFormatter: Intl.NumberFormat;
  pointDateFormatter?: Intl.DateTimeFormat;
  colors: DashboardChartThemeColors;
  theme: MantineTheme;
  isDarkMode: boolean;
  onPeriodDoubleClick?: (periodValue: string) => void;
  onZoom?: (event: AgZoomEvent) => void;
  onSeriesVisibilityChange?: (event: AgSeriesVisibilityChange) => void;
};
