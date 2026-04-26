import {
  getPeriodTimeline,
  type PeriodTimelineResponse,
} from "@/server/period-timeline";

export type TimelinePageLoaderData = {
  monthTimeline: PeriodTimelineResponse;
  yearTimeline: PeriodTimelineResponse;
};

export async function loadTimelinePageData(args: {
  accountBookId: string;
}): Promise<TimelinePageLoaderData> {
  const [monthTimeline, yearTimeline] = await Promise.all([
    getPeriodTimeline({
      data: {
        accountBookId: args.accountBookId,
        granularity: "month",
      },
    }),
    getPeriodTimeline({
      data: {
        accountBookId: args.accountBookId,
        granularity: "year",
      },
    }),
  ]);

  return {
    monthTimeline,
    yearTimeline,
  };
}
