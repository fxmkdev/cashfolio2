import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Suspense, lazy, useEffect } from "react";
import { loadTimelinePageData } from "./-page-loader";
import { buildTimelineSearchNavigation } from "./-page-navigation";
import {
  getTimelineMetric,
  getTimelineMode,
  getTimelineScopeForMetric,
  getTimelineScopedMetric,
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
    metric: getTimelineMetric(search),
    incomeScope: getTimelineScopeForMetric({
      search,
      metric: "income",
    }),
    expenseScope: getTimelineScopeForMetric({
      search,
      metric: "expenses",
    }),
    assetScope: getTimelineScopeForMetric({
      search,
      metric: "assets",
    }),
    liabilityScope: getTimelineScopeForMetric({
      search,
      metric: "liabilities",
    }),
    scopedMetric: getTimelineScopedMetric(getTimelineMetric(search)),
  }),
  loader: async ({
    params: { accountBookId },
    deps: {
      mode,
      scopedMetric,
      incomeScope,
      expenseScope,
      assetScope,
      liabilityScope,
    },
  }) => {
    return loadTimelinePageData({
      accountBookId,
      mode,
      scopedMetric,
      incomeScope,
      expenseScope,
      assetScope,
      liabilityScope,
    });
  },
  component: TimelinePage,
});

function TimelinePage() {
  const { accountBookId } = Route.useParams();
  const search = Route.useSearch();
  const selectedMode = getTimelineMode(search);
  const selectedMetric = getTimelineMetric(search);
  const selectedIncomeScope = getTimelineScopeForMetric({
    search,
    metric: "income",
  });
  const selectedExpenseScope = getTimelineScopeForMetric({
    search,
    metric: "expenses",
  });
  const selectedAssetScope = getTimelineScopeForMetric({
    search,
    metric: "assets",
  });
  const selectedLiabilityScope = getTimelineScopeForMetric({
    search,
    metric: "liabilities",
  });
  const { timeline } = Route.useLoaderData();
  const navigate = useNavigate({ from: "/$accountBookId/timeline" });

  useEffect(() => {
    if (
      selectedIncomeScope === timeline.scopeSelection.income &&
      selectedExpenseScope === timeline.scopeSelection.expenses &&
      selectedAssetScope === timeline.scopeSelection.assets &&
      selectedLiabilityScope === timeline.scopeSelection.liabilities
    ) {
      return;
    }

    navigate(
      buildTimelineSearchNavigation({
        mode: selectedMode,
        metric: selectedMetric,
        incomeScope: timeline.scopeSelection.income,
        expenseScope: timeline.scopeSelection.expenses,
        assetScope: timeline.scopeSelection.assets,
        liabilityScope: timeline.scopeSelection.liabilities,
      }),
    );
  }, [
    navigate,
    selectedAssetScope,
    selectedExpenseScope,
    selectedIncomeScope,
    selectedLiabilityScope,
    selectedMetric,
    selectedMode,
    timeline.scopeSelection.assets,
    timeline.scopeSelection.expenses,
    timeline.scopeSelection.income,
    timeline.scopeSelection.liabilities,
  ]);

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
              incomeScope: timeline.scopeSelection.income,
              expenseScope: timeline.scopeSelection.expenses,
              assetScope: timeline.scopeSelection.assets,
              liabilityScope: timeline.scopeSelection.liabilities,
            }),
          )
        }
        onMetricChange={(metric) =>
          navigate(
            buildTimelineSearchNavigation({
              mode: selectedMode,
              metric,
              incomeScope: timeline.scopeSelection.income,
              expenseScope: timeline.scopeSelection.expenses,
              assetScope: timeline.scopeSelection.assets,
              liabilityScope: timeline.scopeSelection.liabilities,
            }),
          )
        }
        onMetricScopeChange={(scope) =>
          navigate(
            buildTimelineSearchNavigation({
              mode: selectedMode,
              metric: selectedMetric,
              incomeScope:
                selectedMetric === "income"
                  ? scope
                  : timeline.scopeSelection.income,
              expenseScope:
                selectedMetric === "expenses"
                  ? scope
                  : timeline.scopeSelection.expenses,
              assetScope:
                selectedMetric === "assets"
                  ? scope
                  : timeline.scopeSelection.assets,
              liabilityScope:
                selectedMetric === "liabilities"
                  ? scope
                  : timeline.scopeSelection.liabilities,
            }),
          )
        }
      />
    </Suspense>
  );
}
