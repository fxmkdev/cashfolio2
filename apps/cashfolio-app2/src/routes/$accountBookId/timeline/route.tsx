import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Suspense, lazy, useEffect } from "react";
import { createDocumentTitleHead } from "@/shared/document-title";
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
    gainLossScope: getTimelineScopeForMetric({
      search,
      metric: "gainsLosses",
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
      gainLossScope,
      assetScope,
      liabilityScope,
    },
  }) => {
    const { getAuthenticatedUserLocale } =
      await import("@/server/user-profile");
    const userLocale = await getAuthenticatedUserLocale();
    return loadTimelinePageData({
      accountBookId,
      mode,
      scopedMetric,
      incomeScope,
      expenseScope,
      gainLossScope,
      assetScope,
      liabilityScope,
      locale: userLocale,
    });
  },
  head: () => createDocumentTitleHead("History"),
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
  const selectedGainLossScope = getTimelineScopeForMetric({
    search,
    metric: "gainsLosses",
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
      selectedGainLossScope === timeline.scopeSelection.gainsLosses &&
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
        gainLossScope: timeline.scopeSelection.gainsLosses,
        assetScope: timeline.scopeSelection.assets,
        liabilityScope: timeline.scopeSelection.liabilities,
      }),
    );
  }, [
    navigate,
    selectedAssetScope,
    selectedExpenseScope,
    selectedGainLossScope,
    selectedIncomeScope,
    selectedLiabilityScope,
    selectedMetric,
    selectedMode,
    timeline.scopeSelection.assets,
    timeline.scopeSelection.expenses,
    timeline.scopeSelection.gainsLosses,
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
              gainLossScope: timeline.scopeSelection.gainsLosses,
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
              gainLossScope: timeline.scopeSelection.gainsLosses,
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
              gainLossScope:
                selectedMetric === "gainsLosses"
                  ? scope
                  : timeline.scopeSelection.gainsLosses,
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
