import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Suspense, lazy } from "react";
import { loadTimelinePageData } from "./-page-loader";
import { buildTimelineSearchNavigation } from "./-page-navigation";
import {
  getTimelineMetric,
  getTimelineMode,
  parseTimelineSearch,
} from "./-page-types";

const TimelinePageView = lazy(async () => {
  const module = await import("./-page-view");
  return { default: module.TimelinePageView };
});

export const Route = createFileRoute("/$accountBookId/timeline")({
  validateSearch: parseTimelineSearch,
  loaderDeps: ({ search }) => ({
    mode: getTimelineMode(search),
  }),
  loader: async ({ params: { accountBookId }, deps: { mode } }) => {
    return loadTimelinePageData({ accountBookId, mode });
  },
  component: TimelinePage,
});

function TimelinePage() {
  const { accountBookId } = Route.useParams();
  const search = Route.useSearch();
  const selectedMode = getTimelineMode(search);
  const selectedMetric = getTimelineMetric(search);
  const { timeline } = Route.useLoaderData();
  const navigate = useNavigate({ from: "/$accountBookId/timeline" });

  return (
    <Suspense fallback={null}>
      <TimelinePageView
        accountBookId={accountBookId}
        selectedMode={selectedMode}
        selectedMetric={selectedMetric}
        timeline={timeline}
        onModeChange={(mode) =>
          navigate(
            buildTimelineSearchNavigation({
              mode,
              metric: selectedMetric,
            }),
          )
        }
        onMetricChange={(metric) =>
          navigate(
            buildTimelineSearchNavigation({
              mode: selectedMode,
              metric,
            }),
          )
        }
      />
    </Suspense>
  );
}
