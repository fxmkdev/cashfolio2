import {
  getPeriodTimeline,
  type PeriodTimelineResponse,
} from "@/server/period-timeline";
import type { TimelinePeriodMode } from "./-page-types";
import type {
  TimelineScopeSelection,
  TimelineScopedMetric,
} from "@/shared/timeline-scope";

export type TimelinePageLoaderData = {
  timeline: PeriodTimelineResponse;
};

export async function loadTimelinePageData(args: {
  accountBookId: string;
  mode: TimelinePeriodMode;
  scopedMetric?: TimelineScopedMetric;
  incomeScope: TimelineScopeSelection;
  expenseScope: TimelineScopeSelection;
  gainLossScope: TimelineScopeSelection;
  assetScope: TimelineScopeSelection;
  liabilityScope: TimelineScopeSelection;
}): Promise<TimelinePageLoaderData> {
  const timeline = await getPeriodTimeline({
    data: {
      accountBookId: args.accountBookId,
      granularity: args.mode,
      scopedMetric: args.scopedMetric,
      incomeScope: args.incomeScope,
      expenseScope: args.expenseScope,
      gainLossScope: args.gainLossScope,
      assetScope: args.assetScope,
      liabilityScope: args.liabilityScope,
    },
  });

  return {
    timeline,
  };
}
