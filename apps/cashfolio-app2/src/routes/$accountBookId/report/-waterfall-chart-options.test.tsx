import { MantineProvider } from "@mantine/core";
import type {
  AgCartesianChartOptions,
  AgWaterfallSeriesOptions,
} from "ag-charts-community";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { ContributionChartCard } from "./-contribution-chart-card";
import { useGainsLossesWaterfallChartOptions } from "./-gains-losses/-gains-losses-chart-options";
import { mockColors } from "../history/-chart-test-helpers";

let capturedOptions: AgCartesianChartOptions;
vi.mock("ag-charts-react", () => ({
  AgCharts: ({ options }: { options: AgCartesianChartOptions }) => {
    capturedOptions = options;
    return null;
  },
}));

const currencyFormatter = new Intl.NumberFormat("en-CH", {
  style: "currency",
  currency: "CHF",
});
const waterfallPalette = {
  positive: "#00aa00",
  negative: "#aa0000",
  total: "#888888",
};

function getWaterfallSeries() {
  const series = capturedOptions.series?.[0];
  if (series?.type !== "waterfall") {
    throw new Error("Expected a waterfall series");
  }
  return series;
}

function renderTooltip(
  series: AgWaterfallSeriesOptions,
  params: {
    itemType: "positive" | "negative" | "subtotal" | "total";
    datum?: unknown;
  },
) {
  const renderer = series.tooltip?.renderer;
  if (!renderer) {
    throw new Error("Expected a tooltip renderer");
  }
  return renderer(params as Parameters<typeof renderer>[0]);
}

describe("contribution waterfall v14 callbacks", () => {
  test.each([
    { income: 100, expenses: 40, gainsLosses: 10, savings: 60, total: 70 },
    { income: 20, expenses: 40, gainsLosses: -10, savings: -20, total: -30 },
    { income: 40, expenses: 40, gainsLosses: 0, savings: 0, total: 0 },
  ])("formats aggregate bars without source data: %j", (stats) => {
    renderToStaticMarkup(
      createElement(
        MantineProvider,
        null,
        createElement(ContributionChartCard, {
          stats,
          currencyFormatter,
          locale: "en-CH",
          colors: mockColors,
          waterfallPalette,
        }),
      ),
    );
    const series = getWaterfallSeries();
    expect(series.item?.total).toEqual({
      fill: waterfallPalette.total,
      stroke: waterfallPalette.total,
    });
    for (const [itemType, heading, amount] of [
      ["subtotal", "Savings", stats.savings],
      ["total", "Total Return", stats.total],
    ] as const) {
      expect(renderTooltip(series, { itemType, datum: undefined })).toEqual({
        heading,
        data: [{ label: "Total", value: currencyFormatter.format(amount) }],
      });
    }
    expect(
      renderTooltip(series, {
        itemType: "negative",
        datum: { label: "Expenses", amount: -stats.expenses },
      }),
    ).toEqual({
      heading: "Expenses",
      data: [
        { label: "Total", value: currencyFormatter.format(-stats.expenses) },
      ],
    });
  });

  test("formats numeric axis bigint values without losing integer precision", () => {
    renderToStaticMarkup(
      createElement(
        MantineProvider,
        null,
        createElement(ContributionChartCard, {
          stats: { income: 1, expenses: 0, gainsLosses: 0 },
          currencyFormatter,
          locale: "en-CH",
          colors: mockColors,
          waterfallPalette,
        }),
      ),
    );
    const formatter = capturedOptions.axes?.y?.label?.formatter;
    const value = 9007199254740993n;
    expect(
      formatter?.({ value } as Parameters<NonNullable<typeof formatter>>[0]),
    ).toBe(
      new Intl.NumberFormat("en-CH", {
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(value),
    );
  });
});

describe("gains/losses waterfall v14 callbacks", () => {
  test("formats aggregates and ignores aggregate clicks while preserving node drilldown", () => {
    const datum = {
      id: "group:security",
      label: "Security",
      totalGainLoss: -15,
      isDrillable: true,
    };
    const onNodeDoubleClick = vi.fn();
    function Harness() {
      capturedOptions = useGainsLossesWaterfallChartOptions({
        chartData: [
          datum,
          { ...datum, id: "group:fx", label: "FX", totalGainLoss: 5 },
        ],
        totals: [{ totalType: "total", index: 1, axisLabel: "Total" }],
        totalGainLoss: -10,
        totalAxisLabel: "Total",
        colors: mockColors,
        waterfallPalette,
        currencyFormatter,
        onNodeDoubleClick,
      });
      return null;
    }
    renderToStaticMarkup(createElement(Harness));
    const series = getWaterfallSeries();
    for (const itemType of ["total", "subtotal"] as const) {
      expect(renderTooltip(series, { itemType, datum: undefined })).toEqual({
        heading: "Total",
        data: [{ label: "Total", value: currencyFormatter.format(-10) }],
      });
    }
    expect(renderTooltip(series, { itemType: "negative", datum })).toEqual({
      heading: "Security",
      data: [{ label: "Total", value: currencyFormatter.format(-15) }],
    });
    const listener = series.listeners?.seriesNodeDoubleClick;
    if (!listener) throw new Error("Expected a double-click listener");
    type Event = Parameters<typeof listener>[0];
    listener({ datum: undefined } as Event);
    listener({ datum: {} } as Event);
    expect(onNodeDoubleClick).not.toHaveBeenCalled();
    listener({ datum } as Event);
    expect(onNodeDoubleClick).toHaveBeenCalledExactlyOnceWith(datum);
  });
});
