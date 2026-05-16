import type { MantineTheme } from "@mantine/core";
import { describe, expect, test } from "vitest";
import {
  getDefaultRangeButtonLabel,
  getHistoryRangeButtons,
  getHistoryRangeControlStyles,
} from "./-range-controls";

const mockTheme = {
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

describe("history range controls", () => {
  test("returns default range button labels by period mode", () => {
    expect(getDefaultRangeButtonLabel("month")).toBe("1Y");
    expect(getDefaultRangeButtonLabel("year")).toBe("5Y");
  });

  test("returns monthly range buttons shortest to longest", () => {
    expect(getHistoryRangeButtons("month")).toEqual([
      { label: "6M", value: { unit: "month", step: 6 } },
      { label: "1Y", value: "year" },
      { label: "3Y", value: { unit: "year", step: 3 } },
      { label: "All", value: undefined },
    ]);
  });

  test("returns yearly range buttons shortest to longest", () => {
    expect(getHistoryRangeButtons("year")).toEqual([
      { label: "3Y", value: { unit: "year", step: 3 } },
      { label: "5Y", value: { unit: "year", step: 5 } },
      { label: "10Y", value: { unit: "year", step: 10 } },
      { label: "All", value: undefined },
    ]);
  });

  test("returns dark mode range control styles from Mantine tokens", () => {
    expect(
      getHistoryRangeControlStyles({
        theme: mockTheme,
        isDarkMode: true,
      }),
    ).toEqual({
      fill: "#26292e",
      stroke: "#495057",
      textColor: "#e9ecef",
      active: {
        fill: "#1e40af",
        stroke: "#1d4ed8",
        textColor: "#ffffff",
      },
      hover: {
        fill: "#2f3338",
        stroke: "#6c757d",
        textColor: "#ffffff",
      },
      disabled: {
        fill: "#1f2226",
        stroke: "#3b3f44",
        textColor: "#868e96",
      },
    });
  });
});
