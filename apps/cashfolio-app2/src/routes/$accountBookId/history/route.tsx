import { useLedgerNavigationState } from "@/hooks/use-ledger-navigation-state";
import {
  createFileRoute,
  redirect,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { Suspense, lazy, useEffect } from "react";
import { createDocumentTitleHead } from "@/shared/document-title";
import { loadHistoryPageData } from "./-page-loader";
import { buildHistoryAccountDrillNavigation } from "./-account-drilldown";
import {
  buildHistorySearchNavigation,
  buildHistoryViewNavigation,
} from "./-page-navigation";
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
    cashFlowScope: getHistoryScopeForMetric({
      search,
      metric: "cashFlow",
    }),
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
    netWorthScope: getHistoryScopeForMetric({
      search,
      metric: "netWorth",
    }),
    scopedMetric: getHistoryScopedMetric(getHistoryMetric(search)),
  }),
  beforeLoad: ({ location, params, search }) => {
    if (
      "assetScope" in location.search ||
      "liabilityScope" in location.search
    ) {
      throw redirect({
        to: "/$accountBookId/history",
        params,
        search,
        replace: true,
      });
    }
  },
  loader: async ({
    params: { accountBookId },
    deps: {
      mode,
      scopedMetric,
      cashFlowScope,
      incomeScope,
      expenseScope,
      gainLossScope,
      netWorthScope,
    },
  }) => {
    const { getAuthenticatedUserLocale } =
      await import("@/server/user-profile");
    const userLocale = await getAuthenticatedUserLocale();
    return loadHistoryPageData({
      accountBookId,
      mode,
      scopedMetric,
      cashFlowScope,
      incomeScope,
      expenseScope,
      gainLossScope,
      netWorthScope,
      locale: userLocale,
    });
  },
  head: () => createDocumentTitleHead("History"),
  component: HistoryPage,
});

function HistoryPage() {
  const ledgerNavigationState = useLedgerNavigationState();
  const isViewPending = useRouterState({
    select: (state) => state.status === "pending",
  });
  const { accountBookId } = Route.useParams();
  const search = Route.useSearch();
  const selectedMode = getHistoryMode(search);
  const selectedMetric = getHistoryMetric(search);
  const selectedCashFlowScope = getHistoryScopeForMetric({
    search,
    metric: "cashFlow",
  });
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
  const selectedNetWorthScope = getHistoryScopeForMetric({
    search,
    metric: "netWorth",
  });
  const { history } = Route.useLoaderData();
  const navigate = useNavigate({ from: "/$accountBookId/history" });

  useEffect(() => {
    if (
      selectedCashFlowScope === history.scopeSelection.cashFlow &&
      selectedIncomeScope === history.scopeSelection.income &&
      selectedExpenseScope === history.scopeSelection.expenses &&
      selectedGainLossScope === history.scopeSelection.gainsLosses &&
      selectedNetWorthScope === history.scopeSelection.netWorth
    ) {
      return;
    }

    navigate(
      buildHistorySearchNavigation({
        mode: selectedMode,
        metric: selectedMetric,
        cashFlowScope: history.scopeSelection.cashFlow,
        incomeScope: history.scopeSelection.income,
        expenseScope: history.scopeSelection.expenses,
        gainLossScope: history.scopeSelection.gainsLosses,
        netWorthScope: history.scopeSelection.netWorth,
      }),
    );
  }, [
    navigate,
    selectedNetWorthScope,
    selectedCashFlowScope,
    selectedExpenseScope,
    selectedGainLossScope,
    selectedIncomeScope,
    selectedMetric,
    selectedMode,
    history.scopeSelection.cashFlow,
    history.scopeSelection.netWorth,
    history.scopeSelection.expenses,
    history.scopeSelection.gainsLosses,
    history.scopeSelection.income,
  ]);

  return (
    <Suspense fallback={null}>
      <HistoryPageView
        accountBookId={accountBookId}
        selectedMode={selectedMode}
        selectedMetric={selectedMetric}
        isViewPending={isViewPending}
        history={history}
        onAccountPeriodDoubleClick={(target, periodValue) => {
          const navigation = buildHistoryAccountDrillNavigation({
            accountBookId,
            target,
            periodValue,
          });
          if (navigation)
            void navigate({ ...navigation, state: ledgerNavigationState });
        }}
        onModeChange={(mode) =>
          navigate(
            buildHistorySearchNavigation({
              mode,
              metric: selectedMetric,
              cashFlowScope: history.scopeSelection.cashFlow,
              incomeScope: history.scopeSelection.income,
              expenseScope: history.scopeSelection.expenses,
              gainLossScope: history.scopeSelection.gainsLosses,
              netWorthScope: history.scopeSelection.netWorth,
            }),
          )
        }
        onViewChange={(selection) =>
          navigate(
            buildHistoryViewNavigation({
              mode: selectedMode,
              selection,
              scopeSelection: history.scopeSelection,
            }),
          )
        }
      />
    </Suspense>
  );
}
