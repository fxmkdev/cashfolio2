import type { MantineTheme } from "@mantine/core";

export const mockTheme = {
  primaryColor: "blue",
  primaryShade: {
    light: 6,
    dark: 8,
  },
  white: "#ffffff",
  black: "#000000",
  colors: {
    blue: [
      "#f0f4ff",
      "#e0e7ff",
      "#c7d2fe",
      "",
      "",
      "",
      "#2563eb",
      "#1d4ed8",
      "#1e40af",
      "#172554",
    ],
    green: ["", "", "", "", "", "#2f9e44", "#2b8a3e"],
    red: ["", "", "", "", "", "#f03e3e", "#e03131"],
    gray: [
      "#f8f9fa",
      "#f1f3f5",
      "#e9ecef",
      "#dee2e6",
      "#ced4da",
      "#adb5bd",
      "#868e96",
      "#343a40",
    ],
    dark: [
      "",
      "",
      "#6c757d",
      "#495057",
      "#3b3f44",
      "#2f3338",
      "#26292e",
      "#1f2226",
    ],
  },
} as unknown as MantineTheme;

export const mockColors = {
  chartTextColor: "#111",
  themeBorderColor: "#222",
  tooltipBackgroundColor: "#333",
  tooltipTextColor: "#444",
  tooltipSubtleTextColor: "#555",
  incomeFillColor: "#666",
  incomeStrokeColor: "#777",
  expenseFillColor: "#888",
  expenseStrokeColor: "#999",
  netStrokeColor: "#aaa",
  positiveMarkerColor: "#bbb",
  negativeMarkerColor: "#ccc",
  zeroLineColor: "#ddd",
};

export function createTimelinePoint(args: {
  periodValue: string;
  periodLabel: string;
  totalReturn: number;
  savings: number;
  income: number;
  expenses: number;
  gainsLosses: number;
  assets?: number;
  liabilities?: number;
  netWorth?: number;
  periodEndDate?: string;
}) {
  const inferPeriodEndDate = () => {
    const monthMatch = /^(\d{4})-(\d{2})$/.exec(args.periodValue);
    if (monthMatch) {
      const year = Number(monthMatch[1]);
      const monthZeroBased = Number(monthMatch[2]) - 1;
      return new Date(Date.UTC(year, monthZeroBased + 1, 0)).toISOString();
    }

    const yearMatch = /^(\d{4})$/.exec(args.periodValue);
    if (yearMatch) {
      const year = Number(yearMatch[1]);
      return new Date(Date.UTC(year, 11, 31)).toISOString();
    }

    return "1970-01-01T00:00:00.000Z";
  };

  return {
    ...args,
    periodEndDate: args.periodEndDate ?? inferPeriodEndDate(),
    assets: args.assets ?? 100,
    liabilities: args.liabilities ?? 40,
    netWorth: args.netWorth ?? (args.assets ?? 100) - (args.liabilities ?? 40),
  };
}
