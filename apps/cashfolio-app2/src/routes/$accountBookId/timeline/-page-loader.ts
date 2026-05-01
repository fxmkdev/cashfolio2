import {
  getPeriodTimeline,
  type PeriodTimelineResponse,
} from "@/server/period-timeline";
import type { TimelinePeriodMode } from "./-page-types";

export type TimelinePageLoaderData = {
  timeline: PeriodTimelineResponse;
};

export async function loadTimelinePageData(args: {
  accountBookId: string;
  mode: TimelinePeriodMode;
}): Promise<TimelinePageLoaderData> {
  const timeline = await getPeriodTimeline({
    data: {
      accountBookId: args.accountBookId,
      granularity: args.mode,
    },
  });

  return {
    timeline,
  };
}
