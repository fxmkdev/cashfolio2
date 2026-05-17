import type { MantineTheme } from "@mantine/core";
import type { AgRangesButton } from "ag-charts-community";
import type { HistoryPeriodMode } from "./-page-types";

export function getHistoryRangeButtons(
  periodMode: HistoryPeriodMode,
): AgRangesButton[] {
  if (periodMode === "year") {
    return [
      { label: "3Y", value: { unit: "year" as const, step: 3 } },
      { label: "5Y", value: { unit: "year" as const, step: 5 } },
      { label: "10Y", value: { unit: "year" as const, step: 10 } },
      { label: "All", value: undefined },
    ];
  }

  return [
    { label: "6M", value: { unit: "month" as const, step: 6 } },
    { label: "1Y", value: "year" },
    { label: "3Y", value: { unit: "year" as const, step: 3 } },
    { label: "All", value: undefined },
  ];
}

export function getDefaultRangeButtonLabel(
  periodMode: HistoryPeriodMode,
): string {
  return periodMode === "year" ? "5Y" : "1Y";
}

export function getHistoryRangeControlStyles(args: {
  theme: MantineTheme;
  isDarkMode: boolean;
}) {
  const primaryScale = args.theme.colors[args.theme.primaryColor];
  const primaryShade =
    typeof args.theme.primaryShade === "number"
      ? args.theme.primaryShade
      : args.isDarkMode
        ? args.theme.primaryShade.dark
        : args.theme.primaryShade.light;
  const activeFill = primaryScale?.[primaryShade] ?? args.theme.colors.blue[6];
  const activeStroke =
    primaryScale?.[Math.max(0, primaryShade - 1)] ?? args.theme.colors.blue[7];
  const activeText =
    primaryScale?.[Math.min(9, primaryShade + 1)] ?? args.theme.colors.blue[8];

  if (args.isDarkMode) {
    return {
      fill: args.theme.colors.dark[6],
      stroke: args.theme.colors.dark[3],
      textColor: args.theme.colors.gray[2],
      active: {
        fill: activeFill,
        stroke: activeStroke,
        textColor: args.theme.white,
      },
      hover: {
        fill: args.theme.colors.dark[5],
        stroke: args.theme.colors.dark[2],
        textColor: args.theme.white,
      },
      disabled: {
        fill: args.theme.colors.dark[7],
        stroke: args.theme.colors.dark[4],
        textColor: args.theme.colors.gray[6],
      },
    };
  }

  return {
    fill: args.theme.white,
    stroke: args.theme.colors.gray[4],
    textColor: args.theme.colors.gray[7],
    active: {
      fill: primaryScale?.[1] ?? args.theme.colors.blue[1],
      stroke: activeFill,
      textColor: activeText,
    },
    hover: {
      fill: args.theme.colors.gray[0],
      stroke: args.theme.colors.gray[5],
      textColor: args.theme.black,
    },
    disabled: {
      fill: args.theme.colors.gray[1],
      stroke: args.theme.colors.gray[3],
      textColor: args.theme.colors.gray[5],
    },
  };
}
