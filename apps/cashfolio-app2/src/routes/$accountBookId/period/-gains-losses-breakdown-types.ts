import type { getPeriodOverview } from "@/server/period";

type PeriodOverview = Awaited<ReturnType<typeof getPeriodOverview>>;

export type GainsLossesBreakdownNode =
  PeriodOverview["gainsLossesBreakdown"]["hierarchy"][number];
