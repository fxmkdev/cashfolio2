export type DashboardPeriod = "12m" | "10y";

export type DashboardSearch = {
  period?: DashboardPeriod;
};

export const DASHBOARD_PERIOD_12M: DashboardPeriod = "12m";
export const DASHBOARD_PERIOD_10Y: DashboardPeriod = "10y";

function isDashboardPeriod(value: unknown): value is DashboardPeriod {
  return value === DASHBOARD_PERIOD_10Y || value === DASHBOARD_PERIOD_12M;
}

export function parseDashboardSearch(
  search: Record<string, unknown>,
): DashboardSearch {
  return {
    period: isDashboardPeriod(search.period) ? search.period : undefined,
  };
}

export function getDashboardPeriod(search: DashboardSearch): DashboardPeriod {
  return search.period ?? DASHBOARD_PERIOD_12M;
}
