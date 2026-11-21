import { useMemo } from "react";
import { AgCharts } from "ag-charts-react";
import type { AgChartOptions } from "ag-charts-community";
import { useComputedColorScheme, useMantineTheme } from "@mantine/core";
import { ensureChartModulesRegistered } from "@/ag-chart-modules";
import { useUserLocale } from "@/user-locale-context";
import { getDashboardChartThemeColors } from "../charts/dashboard-chart-theme";
import type { PricePoint, PriceRange } from "./types";
import type { PriceOmission } from "@/shared/securities/contracts";
import { historyChartData } from "./history-chart-data";
import classes from "./security-search.module.css";

ensureChartModulesRegistered();

export function SecurityPriceChart({
  points,
  omissions,
  currency,
  name,
  range,
}: {
  points: PricePoint[];
  omissions: PriceOmission[];
  currency: string | null;
  name: string;
  range: PriceRange;
}) {
  const locale = useUserLocale();
  const theme = useMantineTheme();
  const isDarkMode = useComputedColorScheme() === "dark";
  const options = useMemo<AgChartOptions>(() => {
    const colors = getDashboardChartThemeColors({ theme, isDarkMode });
    const amount = new Intl.NumberFormat(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const date = new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeZone: "UTC",
    });
    const axisDate = new Intl.DateTimeFormat(locale, {
      month: "short",
      ...(range === "1M" ? { day: "numeric" } : { year: "2-digit" }),
      timeZone: "UTC",
    });
    const data = historyChartData(points, omissions).map((point) => ({
      ...point,
      date: new Date(`${point.date}T00:00:00Z`),
    }));
    return {
      theme: isDarkMode ? "ag-default-dark" : "ag-default",
      background: { fill: "transparent" },
      data,
      animation: { enabled: false },
      legend: { enabled: false },
      series: [
        {
          type: "line",
          xKey: "date",
          yKey: "close",
          yName: "Closing Price",
          stroke: colors.incomeStrokeColor,
          connectMissingData: false,
          marker: { enabled: omissions.length > 0, size: 3 },
          tooltip: {
            renderer: ({ datum }) => ({
              title: date.format(datum.date),
              data: [
                {
                  label: "Closing Price",
                  value:
                    datum.close === null
                      ? "Unavailable"
                      : `${amount.format(datum.close)}${currency ? ` ${currency}` : ""}`,
                },
              ],
            }),
          },
        },
      ],
      axes: {
        x: {
          type: "time",
          nice: false,
          min: data[0]?.date,
          max: data.at(-1)?.date,
          label: {
            color: colors.chartTextColor,
            formatter: ({ value }) => axisDate.format(value),
          },
        },
        y: {
          type: "number",
          title: {
            text: currency ?? "Price (Currency Unknown)",
            enabled: true,
          },
          label: {
            color: colors.chartTextColor,
            formatter: ({ value }) => amount.format(value),
          },
        },
      },
    };
  }, [points, omissions, currency, locale, theme, isDarkMode, range]);

  return (
    <div role="img" aria-label={`${name} closing price chart`}>
      <AgCharts options={options} className={classes.chart} />
    </div>
  );
}
