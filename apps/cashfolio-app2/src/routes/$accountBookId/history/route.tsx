import { useLedgerNavigationState } from "@/hooks/use-ledger-navigation-state";
import {
  createFileRoute,
  redirect,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import {
  Suspense,
  lazy,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createId } from "@paralleldrive/cuid2";
import { useGlobalLoading } from "@/components/navigation/global-loading";
import { useUserLocale } from "@/user-locale-context";
import { useHistoryLoading } from "./-use-history-loading";
import { HistoryLoadingView, HistoryLoadError } from "./-loading-view";
import type { HistoryDisplayData } from "./-history-loading";
import {
  createHistoryLoadRequest,
  getHistoryDataSelection,
  selectHistoryDisplayScopes,
} from "./-data-selection";
import { createDocumentTitleHead } from "@/shared/navigation/document-title";
import { buildHistoryAccountDrillNavigation } from "./-account-drilldown";
import {
  buildHistorySearchNavigation,
  buildHistoryLegacySearchNavigation,
  buildHistoryViewNavigation,
  buildHistoryScopeNormalization,
  buildHistoryRestoreNavigation,
} from "./-page-navigation";
import {
  getHistoryMetric,
  getHistoryMode,
  parseHistorySearch,
  type HistorySearch,
} from "./-page-types";

const HistoryPageView = lazy(async () => {
  const module = await import("./-page-view");
  return { default: module.HistoryPageView };
});

export const Route = createFileRoute("/$accountBookId/history")({
  validateSearch: parseHistorySearch,
  ssr: false,
  loaderDeps: ({ search }) => getHistoryDataSelection(search),
  beforeLoad: ({ location, params }) => {
    const navigation = buildHistoryLegacySearchNavigation(location.search);
    if (navigation) {
      throw redirect({
        to: "/$accountBookId/history",
        params,
        ...navigation,
      });
    }
  },
  loader: () => ({ reloadKey: createId() }),
  head: () => createDocumentTitleHead("History"),
  component: HistoryPage,
});

function HistoryPage() {
  const { accountBookId } = Route.useParams();
  const search = Route.useSearch();
  const locale = useUserLocale();
  const { reloadKey } = Route.useLoaderData();
  const { mode, scopedMetric, scope } = getHistoryDataSelection(search);
  const request = useMemo(
    () =>
      createHistoryLoadRequest({
        accountBookId,
        mode,
        scopedMetric,
        scope,
        locale,
      }),
    [accountBookId, mode, scopedMetric, scope, locale],
  );
  const loading = useHistoryLoading(request, reloadKey);
  const displayHistory = useMemo(
    () =>
      loading.history &&
      selectHistoryDisplayScopes(
        loading.history,
        search,
        loading.complete === true,
      ),
    [loading.history, loading.complete, search],
  );
  const navigate = useNavigate({ from: "/$accountBookId/history" });
  const normalization = useMemo(
    () =>
      displayHistory &&
      buildHistoryScopeNormalization({
        search,
        scopeSelection: displayHistory.scopeSelection,
      }),
    [displayHistory, search],
  );
  useEffect(() => {
    if (normalization) void navigate(normalization);
  }, [navigate, normalization]);
  // Finish URL normalization before publishing an interactive chart. Otherwise
  // its pending replacement can interrupt the first chart interaction.
  const readyHistory = normalization ? undefined : displayHistory;
  useGlobalLoading(!readyHistory && !loading.error);
  const [previous, setPrevious] = useState<{
    book: string;
    locale: string;
    history: HistoryDisplayData;
    complete: boolean;
    search: HistorySearch;
  }>();
  useEffect(() => {
    if (readyHistory)
      setPrevious({
        book: accountBookId,
        locale,
        history: readyHistory,
        complete: loading.complete === true,
        search,
      });
  }, [readyHistory, loading.complete, accountBookId, locale, search]);
  const shown = readyHistory
    ? { history: readyHistory, search, complete: loading.complete === true }
    : previous?.book === accountBookId && previous.locale === locale
      ? previous
      : undefined;
  if (!shown)
    return <HistoryLoadingView error={loading.error} onRetry={loading.retry} />;
  const restoreNavigation = loading.error
    ? buildHistoryRestoreNavigation({ search, previousSearch: shown.search })
    : undefined;
  return (
    <LoadedHistoryPage
      history={shown.history}
      isHistoryComplete={shown.complete}
      isBackfilling={!!readyHistory && !loading.complete && !loading.error}
      search={shown.search}
      isRefreshing={!readyHistory && !loading.error}
      feedback={
        loading.error ? (
          <HistoryLoadError
            error={loading.error}
            onRetry={loading.retry}
            onRestore={
              restoreNavigation
                ? () => void navigate(restoreNavigation)
                : undefined
            }
          />
        ) : undefined
      }
    />
  );
}

function LoadedHistoryPage({
  history,
  search,
  isRefreshing,
  isHistoryComplete,
  isBackfilling,
  feedback,
}: {
  history: HistoryDisplayData;
  search: HistorySearch;
  isRefreshing: boolean;
  isHistoryComplete: boolean;
  isBackfilling: boolean;
  feedback?: ReactNode;
}) {
  const ledgerNavigationState = useLedgerNavigationState();
  const isViewPending = useRouterState({
    select: (state) => state.status === "pending",
  });
  const { accountBookId } = Route.useParams();
  const selectedMode = getHistoryMode(search);
  const selectedMetric = getHistoryMetric(search);
  const navigate = useNavigate({ from: "/$accountBookId/history" });

  return (
    <Suspense fallback={null}>
      <HistoryPageView
        accountBookId={accountBookId}
        selectedMode={selectedMode}
        selectedMetric={selectedMetric}
        isViewPending={isViewPending || isRefreshing}
        isHistoryComplete={isHistoryComplete}
        isBackfilling={isBackfilling}
        loadError={feedback}
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
