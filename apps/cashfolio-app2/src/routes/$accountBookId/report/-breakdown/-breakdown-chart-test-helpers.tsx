import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, vi } from "vitest";
import { mockColors } from "../../history/-chart-test-helpers";
import { baseOverview } from "../-page-view.story-fixtures";
import type { PeriodBreakdownChartOptions } from "./-breakdown-chart-options";

export function renderChartOptions(
  useOptions: () => PeriodBreakdownChartOptions,
) {
  let options: PeriodBreakdownChartOptions | undefined;
  function Harness() {
    options = useOptions();
    return null;
  }
  renderToStaticMarkup(createElement(Harness));
  if (!options) throw new Error("Expected chart options");
  return options;
}

export function getBarSeries(options: PeriodBreakdownChartOptions) {
  const series = options.series ?? [];
  expect(series.length).toBeGreaterThan(1);
  return series.map((item) => {
    if (item.type !== "bar") throw new Error("Expected a bar series");
    return item;
  });
}

export function expectCategoryColorsAndLegend(
  options: PeriodBreakdownChartOptions,
) {
  expect(options.legend).toMatchObject({ enabled: true, position: "bottom" });
  for (const item of getBarSeries(options)) {
    expect(item.data).toHaveLength(1);
    expect(item).not.toHaveProperty("fill");
    expect(item).not.toHaveProperty("stroke");
    expect(item.showInLegend).toBe(true);
    expect(item.legendItemName).toBeUndefined();
    expect(item.yName).toBe(item.data?.[0].label);
    const renderer = item.tooltip?.renderer;
    if (!renderer) throw new Error("Expected a tooltip renderer");
    expect(
      renderer({ datum: item.data?.[0] } as Parameters<typeof renderer>[0]),
    ).toEqual({
      heading: item.data?.[0].label,
      data: [
        { label: "Amount", value: item.data?.[0].amountLabel },
        { label: "Share", value: item.data?.[0].percentageLabel },
      ],
    });
  }
}

export const commonArgs = {
  accountBookId: "test-book",
  overview: baseOverview,
  currencyFormatter: new Intl.NumberFormat("en-CH", {
    style: "currency",
    currency: "CHF",
  }),
  percentageFormatter: new Intl.NumberFormat("en-CH"),
  colors: mockColors,
  onBreakdownAccountDoubleClick: vi.fn(),
};
