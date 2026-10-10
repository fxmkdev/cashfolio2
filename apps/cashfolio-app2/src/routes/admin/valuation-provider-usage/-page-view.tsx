import { Card, Group, Stack, Text, Title } from "@mantine/core";
import type { ColDef } from "ag-grid-enterprise";
import { useMemo } from "react";
import { DataGrid } from "@/components/data-grid";
import { getGridUserLocale } from "@/components/grid-locale";
import { PageShell } from "@/components/page-shell";
import { TopPageHeader } from "@/components/top-page-header";
import type {
  ValuationProviderUsageBreakdownRow,
  ValuationProviderUsageRequestRow,
  ValuationProviderUsageResponse,
} from "@/server/valuation-provider-usage";
import { useUserLocale } from "@/user-locale-context";
import classes from "./-page-view.module.css";

type BreakdownGridRow = ValuationProviderUsageBreakdownRow & {
  id: string;
};

export type ValuationProviderUsagePageViewProps = {
  usage: ValuationProviderUsageResponse;
};

const providerLabels = {
  CURRENCYLAYER: "Currencylayer",
  COINLAYER: "Coinlayer",
  MARKETSTACK: "Marketstack",
} as const;

const outcomeLabels = {
  RETRIEVED: "Retrieved",
  NO_DATA: "No data",
  MISSING_RATE: "Missing rate",
  TIMEOUT: "Timeout",
  HTTP_ERROR: "HTTP error",
  PROVIDER_ERROR: "Provider error",
  REQUEST_ERROR: "Request error",
  RATE_LIMIT_RETRY: "Rate-limit retry",
} as const;

const reasonLabels = {
  INITIAL_PROBE: "Initial probe",
  BACKTRACK_PROBE: "Backtrack probe",
  RATE_LIMIT_RETRY: "Rate-limit retry",
} as const;

function labelFromMap<T extends string>(
  labels: Partial<Record<T, string>>,
  value: T | null | undefined,
): string {
  if (!value) return "";
  return labels[value] ?? value;
}

function formatTimestamp(value: unknown, context: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat(getGridUserLocale(context), {
    dateStyle: "short",
    timeStyle: "medium",
    timeZone: "UTC",
  }).format(date);
}

function formatUtcDate(value: unknown, context: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat(getGridUserLocale(context), {
    dateStyle: "short",
    timeZone: "UTC",
  }).format(date);
}

function joinCounts(counts: { key: string; count: number }[]): string {
  if (counts.length === 0) {
    return "No calls";
  }

  return counts
    .map((count) => `${labelFromMap(providerLabels, count.key)} ${count.count}`)
    .join(" · ");
}

export function ValuationProviderUsagePageView({
  usage,
}: ValuationProviderUsagePageViewProps) {
  const userLocale = useUserLocale();
  const summaryByKey = useMemo(
    () =>
      new Map(
        usage.summaryWindows.map((summaryWindow) => [
          summaryWindow.key,
          summaryWindow,
        ]),
      ),
    [usage.summaryWindows],
  );
  const last30DaysSummary = summaryByKey.get("last30Days");

  const breakdownRows = useMemo<BreakdownGridRow[]>(
    () =>
      (last30DaysSummary?.breakdownRows ?? []).map((row) => ({
        ...row,
        id: `${row.provider}:${row.outcome}:${row.requestReason}`,
      })),
    [last30DaysSummary?.breakdownRows],
  );

  const breakdownColumns = useMemo<ColDef<BreakdownGridRow>[]>(
    () => [
      {
        field: "provider",
        headerName: "Provider",
        flex: 1,
        minWidth: 140,
        valueFormatter: ({ value }) => labelFromMap(providerLabels, value),
      },
      {
        field: "outcome",
        headerName: "Outcome",
        flex: 1,
        minWidth: 150,
        valueFormatter: ({ value }) => labelFromMap(outcomeLabels, value),
      },
      {
        field: "requestReason",
        headerName: "Reason",
        flex: 1,
        minWidth: 150,
        valueFormatter: ({ value }) => labelFromMap(reasonLabels, value),
      },
      {
        field: "count",
        headerName: "Calls",
        width: 110,
        filter: "agNumberColumnFilter",
      },
    ],
    [],
  );

  const recentColumns = useMemo<ColDef<ValuationProviderUsageRequestRow>[]>(
    () => [
      {
        field: "requestedAt",
        headerName: "Requested",
        width: 190,
        valueFormatter: ({ context, value }) => formatTimestamp(value, context),
      },
      {
        field: "provider",
        headerName: "Provider",
        width: 150,
        filter: "agTextColumnFilter",
        valueFormatter: ({ value }) => labelFromMap(providerLabels, value),
      },
      {
        field: "requestReason",
        headerName: "Reason",
        width: 160,
        filter: "agTextColumnFilter",
        valueFormatter: ({ value }) => labelFromMap(reasonLabels, value),
      },
      {
        field: "outcome",
        headerName: "Outcome",
        width: 160,
        filter: "agTextColumnFilter",
        valueFormatter: ({ value }) => labelFromMap(outcomeLabels, value),
      },
      {
        field: "valuationDate",
        headerName: "Valuation Date",
        width: 150,
        valueFormatter: ({ context, value }) => formatUtcDate(value, context),
      },
      {
        field: "unitLabel",
        headerName: "Unit",
        minWidth: 150,
        flex: 1,
        filter: "agTextColumnFilter",
      },
      {
        field: "httpStatus",
        headerName: "HTTP",
        width: 100,
        filter: "agNumberColumnFilter",
      },
      {
        field: "durationMs",
        headerName: "Duration",
        width: 120,
        filter: "agNumberColumnFilter",
        valueFormatter: ({ value }) =>
          typeof value === "number" ? `${value} ms` : "",
      },
      {
        field: "retryCount",
        headerName: "Retry",
        width: 100,
        filter: "agNumberColumnFilter",
      },
      {
        field: "errorMessage",
        headerName: "Error",
        minWidth: 220,
        flex: 1,
        filter: "agTextColumnFilter",
      },
    ],
    [],
  );

  return (
    <PageShell className={classes.page}>
      <TopPageHeader heading={<Title order={2}>Provider Usage</Title>} />

      <div className={classes.summaryGrid}>
        {usage.summaryWindows.map((summaryWindow) => (
          <Card key={summaryWindow.key} withBorder radius="md" p="lg">
            <Stack gap={4}>
              <Text c="dimmed" size="sm">
                {summaryWindow.label}
              </Text>
              <Title order={3}>{summaryWindow.totalCount}</Title>
              <Text c="dimmed" size="xs">
                {joinCounts(summaryWindow.byProvider)}
              </Text>
            </Stack>
          </Card>
        ))}
      </div>

      <div className={classes.contentLayout}>
        <Card withBorder radius="md" p="lg">
          <Stack gap={4}>
            <Text fw={600}>30-day Breakdown</Text>
            <Text c="dimmed" size="sm">
              Provider calls by outcome and request reason.
            </Text>
          </Stack>
          {breakdownRows.length === 0 ? (
            <Text c="dimmed" mt="md">
              No provider calls found.
            </Text>
          ) : (
            <div className={classes.breakdownGrid}>
              <DataGrid
                rowData={breakdownRows}
                columnDefs={breakdownColumns}
                getRowId={({ data }) => data.id}
              />
            </div>
          )}
        </Card>

        <Card withBorder radius="md" p="lg">
          <Group justify="space-between" align="flex-start">
            <Stack gap={4}>
              <Text fw={600}>Recent Calls</Text>
              <Text c="dimmed" size="sm">
                Latest 100 external valuation provider attempts.
              </Text>
            </Stack>
            <Text c="dimmed" size="xs">
              Updated {formatTimestamp(usage.generatedAt, { userLocale })}
            </Text>
          </Group>

          {usage.recentRequests.length === 0 ? (
            <Text c="dimmed" mt="md">
              No recent provider calls found.
            </Text>
          ) : (
            <div className={classes.gridContainer}>
              <DataGrid
                rowData={usage.recentRequests}
                columnDefs={recentColumns}
                getRowId={({ data }) => data.id}
              />
            </div>
          )}
        </Card>
      </div>
    </PageShell>
  );
}
