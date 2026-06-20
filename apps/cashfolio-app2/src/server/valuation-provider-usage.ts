import { createServerFn } from "@tanstack/react-start";
import { UserRole } from "../.prisma-client/enums";
import { prisma } from "../prisma.server";
import { ensureUserHasRole } from "../users/functions.server";
import type {
  ValuationProviderName,
  ValuationProviderRequestOutcome,
  ValuationProviderRequestReason,
} from "./valuation/provider-usage";
import { toUtcDay } from "./valuation/date-utils";

export type ValuationProviderUsageWindowKey =
  | "today"
  | "last7Days"
  | "last30Days";

export type ValuationProviderUsageCount = {
  key: string;
  count: number;
};

export type ValuationProviderUsageBreakdownRow = {
  provider: ValuationProviderName;
  outcome: ValuationProviderRequestOutcome;
  requestReason: ValuationProviderRequestReason;
  count: number;
};

export type ValuationProviderUsageSummaryWindow = {
  key: ValuationProviderUsageWindowKey;
  label: string;
  totalCount: number;
  byProvider: ValuationProviderUsageCount[];
  byOutcome: ValuationProviderUsageCount[];
  byReason: ValuationProviderUsageCount[];
  breakdownRows: ValuationProviderUsageBreakdownRow[];
};

export type ValuationProviderUsageRequestRow = {
  id: string;
  provider: ValuationProviderName;
  unitType: string;
  outcome: ValuationProviderRequestOutcome;
  requestReason: ValuationProviderRequestReason;
  requestedAt: string;
  valuationDate: string;
  unitLabel: string;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
  httpStatus: number | null;
  durationMs: number;
  retryCount: number;
  errorMessage: string | null;
};

export type ValuationProviderUsageResponse = {
  generatedAt: string;
  summaryWindows: ValuationProviderUsageSummaryWindow[];
  recentRequests: ValuationProviderUsageRequestRow[];
};

type GroupedProviderUsageRow = {
  provider: ValuationProviderName;
  outcome: ValuationProviderRequestOutcome;
  requestReason: ValuationProviderRequestReason;
  _count: {
    _all: number;
  };
};

function subUtcDays(date: Date, days: number): Date {
  return new Date(date.getTime() - days * 24 * 60 * 60 * 1000);
}

function sumBy<T extends string>(
  rows: ValuationProviderUsageBreakdownRow[],
  getKey: (row: ValuationProviderUsageBreakdownRow) => T,
): ValuationProviderUsageCount[] {
  const countsByKey = new Map<string, number>();
  for (const row of rows) {
    const key = getKey(row);
    countsByKey.set(key, (countsByKey.get(key) ?? 0) + row.count);
  }

  return Array.from(countsByKey.entries())
    .map(([key, count]) => ({ key, count }))
    .toSorted((left, right) => left.key.localeCompare(right.key));
}

function toSummaryWindow(args: {
  key: ValuationProviderUsageWindowKey;
  label: string;
  groupedRows: GroupedProviderUsageRow[];
}): ValuationProviderUsageSummaryWindow {
  const breakdownRows = args.groupedRows
    .map((row) => ({
      provider: row.provider,
      outcome: row.outcome,
      requestReason: row.requestReason,
      count: row._count._all,
    }))
    .toSorted(
      (left, right) =>
        left.provider.localeCompare(right.provider) ||
        left.outcome.localeCompare(right.outcome) ||
        left.requestReason.localeCompare(right.requestReason),
    );

  return {
    key: args.key,
    label: args.label,
    totalCount: breakdownRows.reduce((total, row) => total + row.count, 0),
    byProvider: sumBy(breakdownRows, (row) => row.provider),
    byOutcome: sumBy(breakdownRows, (row) => row.outcome),
    byReason: sumBy(breakdownRows, (row) => row.requestReason),
    breakdownRows,
  };
}

function toUnitLabel(row: {
  unitType: string;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
}): string {
  if (row.unitType === "CURRENCY") {
    return row.currency ?? "";
  }

  if (row.unitType === "CRYPTOCURRENCY") {
    return row.cryptocurrency ?? "";
  }

  const symbol = row.symbol ?? "";
  const tradeCurrency = row.tradeCurrency ? ` (${row.tradeCurrency})` : "";
  return `${symbol}${tradeCurrency}`;
}

export const getValuationProviderUsage = createServerFn({
  method: "GET",
}).handler(async (): Promise<ValuationProviderUsageResponse> => {
  await ensureUserHasRole(UserRole.ADMIN);

  const now = new Date();
  const todayStart = toUtcDay(now);
  const windows = [
    {
      key: "today" as const,
      label: "Today",
      start: todayStart,
    },
    {
      key: "last7Days" as const,
      label: "Last 7 days",
      start: subUtcDays(todayStart, 6),
    },
    {
      key: "last30Days" as const,
      label: "Last 30 days",
      start: subUtcDays(todayStart, 29),
    },
  ];

  const [summaryGroups, recentRequests] = await Promise.all([
    Promise.all(
      windows.map(async (window) => {
        const groupedRows = await prisma.valuationProviderRequest.groupBy({
          by: ["provider", "outcome", "requestReason"],
          where: {
            requestedAt: {
              gte: window.start,
            },
          },
          _count: {
            _all: true,
          },
        });

        return toSummaryWindow({
          key: window.key,
          label: window.label,
          groupedRows: groupedRows as GroupedProviderUsageRow[],
        });
      }),
    ),
    prisma.valuationProviderRequest.findMany({
      orderBy: {
        requestedAt: "desc",
      },
      take: 100,
      select: {
        id: true,
        provider: true,
        unitType: true,
        outcome: true,
        requestReason: true,
        requestedAt: true,
        valuationDate: true,
        currency: true,
        cryptocurrency: true,
        symbol: true,
        tradeCurrency: true,
        httpStatus: true,
        durationMs: true,
        retryCount: true,
        errorMessage: true,
      },
    }),
  ]);

  return {
    generatedAt: now.toISOString(),
    summaryWindows: summaryGroups,
    recentRequests: recentRequests.map((row) => ({
      id: row.id,
      provider: row.provider,
      unitType: row.unitType,
      outcome: row.outcome,
      requestReason: row.requestReason,
      requestedAt: row.requestedAt.toISOString(),
      valuationDate: row.valuationDate.toISOString(),
      unitLabel: toUnitLabel(row),
      currency: row.currency,
      cryptocurrency: row.cryptocurrency,
      symbol: row.symbol,
      tradeCurrency: row.tradeCurrency,
      httpStatus: row.httpStatus,
      durationMs: row.durationMs,
      retryCount: row.retryCount,
      errorMessage: row.errorMessage,
    })),
  };
});
