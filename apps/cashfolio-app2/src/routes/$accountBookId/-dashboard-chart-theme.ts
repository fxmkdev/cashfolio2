import type { MantineTheme } from "@mantine/core";

export type DashboardChartThemeColors = {
  chartTextColor: string;
  themeBorderColor: string;
  tooltipBackgroundColor: string;
  tooltipTextColor: string;
  tooltipSubtleTextColor: string;
  incomeFillColor: string;
  incomeStrokeColor: string;
  expenseFillColor: string;
  expenseStrokeColor: string;
  netStrokeColor: string;
  positiveMarkerColor: string;
  negativeMarkerColor: string;
  zeroLineColor: string;
};

export function getDashboardChartThemeColors(args: {
  theme: MantineTheme;
  isDarkMode: boolean;
}): DashboardChartThemeColors {
  const { theme, isDarkMode } = args;

  return {
    chartTextColor: isDarkMode ? theme.colors.dark[0] : theme.black,
    themeBorderColor: isDarkMode ? theme.colors.dark[4] : theme.colors.gray[3],
    tooltipBackgroundColor: isDarkMode ? theme.colors.dark[6] : theme.white,
    tooltipTextColor: isDarkMode ? theme.colors.gray[0] : theme.black,
    tooltipSubtleTextColor: isDarkMode
      ? theme.colors.gray[3]
      : theme.colors.gray[7],
    incomeFillColor: isDarkMode ? theme.colors.blue[4] : theme.colors.blue[6],
    incomeStrokeColor: isDarkMode ? theme.colors.blue[3] : theme.colors.blue[7],
    expenseFillColor: isDarkMode ? theme.colors.red[4] : theme.colors.red[3],
    expenseStrokeColor: isDarkMode ? theme.colors.red[3] : theme.colors.red[7],
    netStrokeColor: isDarkMode ? theme.colors.teal[3] : theme.colors.teal[8],
    positiveMarkerColor: isDarkMode
      ? theme.colors.green[4]
      : theme.colors.green[7],
    negativeMarkerColor: isDarkMode ? theme.colors.red[4] : theme.colors.red[7],
    zeroLineColor: isDarkMode ? theme.colors.gray[4] : theme.colors.gray[6],
  };
}
