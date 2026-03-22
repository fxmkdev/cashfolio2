import {
  DASHBOARD_PERIOD_10Y,
  DASHBOARD_PERIOD_12M,
  DEFAULT_DASHBOARD_PERIOD,
  isDashboardPeriod,
  type DashboardPeriod,
} from "../../shared/dashboard-period";

export type DashboardSearch = {
  period?: DashboardPeriod;
};

export { DASHBOARD_PERIOD_10Y, DASHBOARD_PERIOD_12M };
export type { DashboardPeriod };

export function parseDashboardSearch(
  search: Record<string, unknown>,
): DashboardSearch {
  return {
    period: isDashboardPeriod(search.period) ? search.period : undefined,
  };
}

export function getDashboardPeriod(search: DashboardSearch): DashboardPeriod {
  return search.period ?? DEFAULT_DASHBOARD_PERIOD;
}
