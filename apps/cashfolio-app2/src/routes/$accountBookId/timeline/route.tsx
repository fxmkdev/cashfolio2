import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Suspense, lazy } from "react";
import { loadTimelinePageData } from "./-page-loader";
import { getTimelineMode, parseTimelineSearch } from "./-page-types";

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
  const { timeline } = Route.useLoaderData();
  const navigate = useNavigate({ from: "/$accountBookId/timeline" });

  return (
    <Suspense fallback={null}>
      <TimelinePageView
        accountBookId={accountBookId}
        selectedMode={selectedMode}
        timeline={timeline}
        onModeChange={(mode) =>
          navigate({
            replace: true,
            search: (previousSearch) => ({
              ...previousSearch,
              mode,
            }),
          })
        }
      />
    </Suspense>
  );
}
