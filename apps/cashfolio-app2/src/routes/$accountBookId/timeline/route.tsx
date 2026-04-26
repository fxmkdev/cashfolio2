import { createFileRoute } from "@tanstack/react-router";
import { Suspense, lazy } from "react";
import { loadTimelinePageData } from "./-page-loader";

const TimelinePageView = lazy(async () => {
  const module = await import("./-page-view");
  return { default: module.TimelinePageView };
});

export const Route = createFileRoute("/$accountBookId/timeline")({
  loader: async ({ params: { accountBookId } }) => {
    return loadTimelinePageData({ accountBookId });
  },
  component: TimelinePage,
});

function TimelinePage() {
  const { accountBookId } = Route.useParams();
  const { monthTimeline, yearTimeline } = Route.useLoaderData();

  return (
    <Suspense fallback={null}>
      <TimelinePageView
        accountBookId={accountBookId}
        monthTimeline={monthTimeline}
        yearTimeline={yearTimeline}
      />
    </Suspense>
  );
}
