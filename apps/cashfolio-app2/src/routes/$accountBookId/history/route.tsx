import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Suspense, lazy, useEffect } from "react";
import { createDocumentTitleHead } from "@/shared/document-title";
import { loadHistoryPageData } from "./-page-loader";
import { buildHistorySearchNavigation } from "./-page-navigation";
import {
  getHistoryMetric,
  getHistoryMode,
  getHistoryScopeForMetric,
  getHistoryScopedMetric,
  parseHistorySearch,
} from "./-page-types";

const HistoryPageView = lazy(async () => {
  const module = await import("./-page-view");
  return { default: module.HistoryPageView };
});

export const Route = createFileRoute("/$accountBookId/history")({
  validateSearch: parseHistorySearch,
  loaderDeps: ({ search }) => ({
    mode: getHistoryMode(search),
    metric: getHistoryMetric(search),
    incomeScope: getHistoryScopeForMetric({
      search,
      metric: "income",
    }),
    expenseScope: getHistoryScopeForMetric({
      search,
      metric: "expenses",
    }),
    gainLossScope: getHistoryScopeForMetric({
      search,
      metric: "gainsLosses",
    }),
    assetScope: getHistoryScopeForMetric({
      search,
      metric: "assets",
    }),
    liabilityScope: getHistoryScopeForMetric({
      search,
      metric: "liabilities",
    }),
    scopedMetric: getHistoryScopedMetric(getHistoryMetric(search)),
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
    return loadHistoryPageData({
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
  component: HistoryPage,
});

function HistoryPage() {
  const { accountBookId } = Route.useParams();
  const search = Route.useSearch();
  const selectedMode = getHistoryMode(search);
  const selectedMetric = getHistoryMetric(search);
  const selectedIncomeScope = getHistoryScopeForMetric({
    search,
    metric: "income",
  });
  const selectedExpenseScope = getHistoryScopeForMetric({
    search,
    metric: "expenses",
  });
  const selectedGainLossScope = getHistoryScopeForMetric({
    search,
    metric: "gainsLosses",
  });
  const selectedAssetScope = getHistoryScopeForMetric({
    search,
    metric: "assets",
  });
  const selectedLiabilityScope = getHistoryScopeForMetric({
    search,
    metric: "liabilities",
  });
  const { history } = Route.useLoaderData();
  const navigate = useNavigate({ from: "/$accountBookId/history" });

  useEffect(() => {
    if (
      selectedIncomeScope === history.scopeSelection.income &&
      selectedExpenseScope === history.scopeSelection.expenses &&
      selectedGainLossScope === history.scopeSelection.gainsLosses &&
      selectedAssetScope === history.scopeSelection.assets &&
      selectedLiabilityScope === history.scopeSelection.liabilities
    ) {
      return;
    }

    navigate(
      buildHistorySearchNavigation({
        mode: selectedMode,
        metric: selectedMetric,
        incomeScope: history.scopeSelection.income,
        expenseScope: history.scopeSelection.expenses,
        gainLossScope: history.scopeSelection.gainsLosses,
        assetScope: history.scopeSelection.assets,
        liabilityScope: history.scopeSelection.liabilities,
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
    history.scopeSelection.assets,
    history.scopeSelection.expenses,
    history.scopeSelection.gainsLosses,
    history.scopeSelection.income,
    history.scopeSelection.liabilities,
  ]);

  return (
    <Suspense fallback={null}>
      <HistoryPageView
        accountBookId={accountBookId}
        selectedMode={selectedMode}
        selectedMetric={selectedMetric}
        history={history}
        onModeChange={(mode) =>
          navigate(
            buildHistorySearchNavigation({
              mode,
              metric: selectedMetric,
              incomeScope: history.scopeSelection.income,
              expenseScope: history.scopeSelection.expenses,
              gainLossScope: history.scopeSelection.gainsLosses,
              assetScope: history.scopeSelection.assets,
              liabilityScope: history.scopeSelection.liabilities,
            }),
          )
        }
        onMetricChange={(metric) =>
          navigate(
            buildHistorySearchNavigation({
              mode: selectedMode,
              metric,
              incomeScope: history.scopeSelection.income,
              expenseScope: history.scopeSelection.expenses,
              gainLossScope: history.scopeSelection.gainsLosses,
              assetScope: history.scopeSelection.assets,
              liabilityScope: history.scopeSelection.liabilities,
            }),
          )
        }
        onMetricScopeChange={(scope) =>
          navigate(
            buildHistorySearchNavigation({
              mode: selectedMode,
              metric: selectedMetric,
              incomeScope:
                selectedMetric === "income"
                  ? scope
                  : history.scopeSelection.income,
              expenseScope:
                selectedMetric === "expenses"
                  ? scope
                  : history.scopeSelection.expenses,
              gainLossScope:
                selectedMetric === "gainsLosses"
                  ? scope
                  : history.scopeSelection.gainsLosses,
              assetScope:
                selectedMetric === "assets"
                  ? scope
                  : history.scopeSelection.assets,
              liabilityScope:
                selectedMetric === "liabilities"
                  ? scope
                  : history.scopeSelection.liabilities,
            }),
          )
        }
      />
    </Suspense>
  );
}
