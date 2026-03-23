export const DASHBOARD_PERIODS = ["12m", "10y"] as const;

export type DashboardPeriod = (typeof DASHBOARD_PERIODS)[number];

export const DASHBOARD_PERIOD_12M: DashboardPeriod = "12m";
export const DASHBOARD_PERIOD_10Y: DashboardPeriod = "10y";
export const DEFAULT_DASHBOARD_PERIOD: DashboardPeriod = DASHBOARD_PERIOD_12M;

export const DASHBOARD_PERIOD_LABEL_BY_PERIOD = {
  [DASHBOARD_PERIOD_12M]: "Last 12 months",
  [DASHBOARD_PERIOD_10Y]: "Last 10 years",
} as const satisfies Record<DashboardPeriod, string>;

export const DASHBOARD_NO_BOOKINGS_MESSAGE_BY_PERIOD = {
  [DASHBOARD_PERIOD_12M]:
    "No income or expense bookings found in the last 12 months.",
  [DASHBOARD_PERIOD_10Y]:
    "No income or expense bookings found in the last 10 years.",
} as const satisfies Record<DashboardPeriod, string>;

export function isDashboardPeriod(value: unknown): value is DashboardPeriod {
  return (
    typeof value === "string" &&
    DASHBOARD_PERIODS.includes(value as DashboardPeriod)
  );
}
