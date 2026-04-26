import {
  getPeriodTimeline,
  type PeriodTimelineResponse,
} from "@/server/period-timeline";

export type TimelinePageLoaderData = {
  monthTimeline: PeriodTimelineResponse;
};

export async function loadTimelinePageData(args: {
  accountBookId: string;
}): Promise<TimelinePageLoaderData> {
  const monthTimeline = await getPeriodTimeline({
    data: {
      accountBookId: args.accountBookId,
      granularity: "month",
    },
  });

  return {
    monthTimeline,
  };
}
