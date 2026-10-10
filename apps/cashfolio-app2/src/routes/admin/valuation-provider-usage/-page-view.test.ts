import { MantineProvider } from "@mantine/core";
import { createElement } from "react";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import type { ValuationProviderUsageResponse } from "@/server/valuation-provider-usage";

vi.mock("@/components/data-grid", () => ({
  DataGrid: ({
    columnDefs,
    rowData,
  }: {
    columnDefs: {
      colId?: string;
      field?: string;
      headerName?: string;
      valueFormatter?: (params: {
        context: Record<string, unknown>;
        value: unknown;
      }) => string;
    }[];
    rowData: Record<string, unknown>[];
  }) =>
    createElement(
      "div",
      { "data-testid": "provider-usage-grid" },
      columnDefs.map((column) =>
        createElement(
          "span",
          { key: `header-${column.colId ?? column.field}` },
          column.headerName,
        ),
      ),
      rowData.map((row) =>
        createElement(
          "div",
          { key: String(row.id) },
          columnDefs.map((column) => {
            const value = column.field ? row[column.field] : undefined;
            const content = column.valueFormatter
              ? column.valueFormatter({
                  context: { userLocale: "en-CH" },
                  value,
                })
              : String(value ?? "");

            return createElement(
              "span",
              { key: `${row.id}-${column.colId ?? column.field}` },
              content as ReactNode,
            );
          }),
        ),
      ),
    ),
}));

import { ValuationProviderUsagePageView } from "./-page-view";

const usage: ValuationProviderUsageResponse = {
  generatedAt: "2026-06-20T15:30:00.000Z",
  summaryWindows: [
    {
      key: "today",
      label: "Today",
      totalCount: 2,
      byProvider: [{ key: "MARKETSTACK", count: 2 }],
      byOutcome: [{ key: "RETRIEVED", count: 2 }],
      byReason: [{ key: "INITIAL_PROBE", count: 2 }],
      breakdownRows: [
        {
          provider: "MARKETSTACK",
          outcome: "RETRIEVED",
          requestReason: "INITIAL_PROBE",
          count: 2,
        },
      ],
    },
    {
      key: "last7Days",
      label: "Last 7 days",
      totalCount: 3,
      byProvider: [{ key: "COINLAYER", count: 3 }],
      byOutcome: [{ key: "NO_DATA", count: 3 }],
      byReason: [{ key: "BACKTRACK_PROBE", count: 3 }],
      breakdownRows: [],
    },
    {
      key: "last30Days",
      label: "Last 30 days",
      totalCount: 5,
      byProvider: [
        { key: "COINLAYER", count: 3 },
        { key: "MARKETSTACK", count: 2 },
      ],
      byOutcome: [
        { key: "NO_DATA", count: 3 },
        { key: "RETRIEVED", count: 2 },
      ],
      byReason: [
        { key: "BACKTRACK_PROBE", count: 3 },
        { key: "RATE_LIMIT_RETRY", count: 2 },
      ],
      breakdownRows: [
        {
          provider: "MARKETSTACK",
          outcome: "RATE_LIMIT_RETRY",
          requestReason: "RATE_LIMIT_RETRY",
          count: 1,
        },
      ],
    },
  ],
  recentRequests: [
    {
      id: "request-1",
      provider: "MARKETSTACK",
      unitType: "SECURITY",
      outcome: "RATE_LIMIT_RETRY",
      requestReason: "RATE_LIMIT_RETRY",
      requestedAt: "2026-06-20T12:00:00.000Z",
      valuationDate: "2026-06-19T00:00:00.000Z",
      unitLabel: "AAPL (USD)",
      currency: null,
      cryptocurrency: null,
      symbol: "AAPL",
      tradeCurrency: "USD",
      httpStatus: 429,
      durationMs: 25,
      retryCount: 1,
      errorMessage: "Too many requests",
    },
  ],
};

describe("ValuationProviderUsagePageView", () => {
  test("renders summary cards, breakdown, and recent provider calls", () => {
    const markup = renderToStaticMarkup(
      createElement(
        MantineProvider,
        null,
        createElement(ValuationProviderUsagePageView, { usage }),
      ),
    );

    expect(markup).toContain("Provider Usage");
    expect(markup).toContain("Today");
    expect(markup).toContain("Last 7 days");
    expect(markup).toContain("Last 30 days");
    expect(markup).toContain("30-day Breakdown");
    expect(markup).toContain("Recent Calls");
    expect(markup).toContain("Provider");
    expect(markup).toContain("Outcome");
    expect(markup).toContain("Reason");
    expect(markup).toContain("Marketstack");
    expect(markup).toContain("Rate-limit retry");
    expect(markup).toContain("AAPL (USD)");
    expect(markup).toContain("Too many requests");
  });
});
