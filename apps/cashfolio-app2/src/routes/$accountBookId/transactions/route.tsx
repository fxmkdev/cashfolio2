import { createFileRoute, Outlet, useRouter } from "@tanstack/react-router";
import { Suspense, lazy, useCallback, useMemo } from "react";
import type { GridApi } from "ag-grid-enterprise";
import { useTransactionScroll } from "@/hooks/use-transaction-scroll";
import { PeriodFilterAction } from "../-period-filter-action";
import { useExplicitPeriodFilter } from "../-use-explicit-period-filter";
import { clampTransactionsExplicitPeriodToBounds } from "./-explicit-period-bounds";
import { useTransactionsPageController } from "./-page-controller";
import { loadTransactionsPageData } from "./-page-loader";
import { createDocumentTitleHead } from "@/shared/document-title";
import { useUserLocale } from "@/user-locale-context";
import {
  getDefaultTransactionsPeriodValue,
  parseTransactionsExplicitPeriod,
  parseTransactionsSearch,
  type TransactionsRow,
} from "./-page-types";

const TransactionsPageView = lazy(async () => {
  const module = await import("./-page-view");
  return { default: module.TransactionsPageView };
});

export const Route = createFileRoute("/$accountBookId/transactions")({
  validateSearch: parseTransactionsSearch,
  loaderDeps: ({ search }) => ({
    period: search.period ?? getDefaultTransactionsPeriodValue(),
  }),
  loader: async ({ params: { accountBookId }, deps: { period } }) => {
    return loadTransactionsPageData({ accountBookId, period });
  },
  head: () => createDocumentTitleHead("Transactions"),
  component: TransactionsLayout,
});

function TransactionsLayout() {
  return <Outlet />;
}

export function TransactionsPageContent() {
  const loaderData = Route.useLoaderData();
  const { accountBookId } = Route.useParams();
  const { transactionId, period } = Route.useSearch();
  const router = useRouter();
  const userLocale = useUserLocale();

  const navigate = Route.useNavigate();
  const { pendingScrollRef, handleRowDataUpdated, getScrollTarget } =
    useTransactionScroll<TransactionsRow>(transactionId, navigate);
  const resolveScrollTarget = useCallback(
    (api: GridApi<TransactionsRow>) => {
      const target = getScrollTarget();
      handleRowDataUpdated({ api });
      return target;
    },
    [getScrollTarget, handleRowDataUpdated],
  );
  const maxDate = useMemo(
    () => new Date(loaderData.periodBounds.maxDate),
    [loaderData.periodBounds.maxDate],
  );
  const currentDate = useMemo(
    () => new Date(loaderData.periodBounds.currentDate),
    [loaderData.periodBounds.currentDate],
  );
  const defaultPeriodValue = useMemo(
    () => getDefaultTransactionsPeriodValue(currentDate),
    [currentDate],
  );
  const minBookingDate = useMemo(
    () =>
      loaderData.periodBounds.minBookingDate
        ? new Date(loaderData.periodBounds.minBookingDate)
        : null,
    [loaderData.periodBounds.minBookingDate],
  );
  const onPeriodChange = useCallback(
    (nextPeriodValue: string | undefined) => {
      navigate({
        search: (previousSearch) => ({
          ...previousSearch,
          period: nextPeriodValue,
          transactionId: undefined,
        }),
      });
    },
    [navigate],
  );
  const { selectedPeriod, setPeriodFilter, controls } = useExplicitPeriodFilter(
    {
      available: true,
      period,
      defaultPeriod: defaultPeriodValue,
      locale: userLocale,
      parsePeriod: parseTransactionsExplicitPeriod,
      clampPeriod: clampTransactionsExplicitPeriodToBounds,
      clampMinDate: minBookingDate,
      navigationMinDate: minBookingDate,
      maxDate,
      allowClear: false,
      onPeriodChange,
    },
  );

  const viewProps = useTransactionsPageController({
    loaderData,
    accountBookId,
    selectedPeriodValue: selectedPeriod?.value,
    setPeriodFilter,
    pendingScrollRef,
    invalidate: () => {
      router.invalidate();
    },
  });

  return (
    <Suspense fallback={null}>
      <TransactionsPageView
        accountBookId={accountBookId}
        {...viewProps}
        periodFilterControls={<PeriodFilterAction {...controls} />}
        navigationTransactionId={transactionId}
        resolveScrollTarget={resolveScrollTarget}
      />
    </Suspense>
  );
}
