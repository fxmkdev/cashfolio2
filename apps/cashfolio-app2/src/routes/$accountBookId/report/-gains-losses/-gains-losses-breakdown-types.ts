import type { getPeriodOverview } from "@/server/period";

type PeriodOverview = Awaited<ReturnType<typeof getPeriodOverview>>;

export type GainsLossesBreakdownNode =
  PeriodOverview["accountBreakdownsByGrouping"]["assetClass"]["gainsLossesBreakdown"]["hierarchy"][number];
