import {
  getAccountManagementContext,
  getAccountManagementPath,
} from "@/shared/account-presentation";
import { AccountGainLossSection } from "@/components/gain-loss/account-gain-loss-section";
import { createFileRoute, Outlet, useRouter } from "@tanstack/react-router";
import { Suspense, lazy, useCallback, useMemo } from "react";
import { useTransactionScroll } from "@/hooks/use-transaction-scroll";
import {
  isLedgerPeriodFilterAvailable,
  loadLedgerPageData,
} from "./-ledger/page-loader";
import { createDocumentTitleHead } from "@/shared/document-title";
import { useUserLocale } from "@/user-locale-context";
import { useLedgerPageController } from "./-ledger/page-controller";
import { PeriodFilterAction } from "../-period-filter-action";
import { useExplicitPeriodFilter } from "../-use-explicit-period-filter";
import {
  parseLedgerExplicitPeriod,
  parseLedgerSearch,
  type LedgerRow,
} from "./-ledger/page-types";
import { clampLedgerExplicitPeriodToBounds } from "./-ledger/explicit-period-bounds";
import { resolvePeriodFilterMinBookingDate } from "./-ledger/period-filter-min-booking-date";

const LedgerPageView = lazy(async () => {
  const module = await import("./-ledger/page-view");
  return { default: module.LedgerPageView };
});

export const Route = createFileRoute("/$accountBookId/$accountId")({
  validateSearch: parseLedgerSearch,
  loaderDeps: ({ search }) => ({
    period: search.period,
  }),
  loader: async ({
    params: { accountBookId, accountId },
    deps: { period },
  }) => {
    return loadLedgerPageData({ accountBookId, accountId, period });
  },
  head: ({ loaderData }) => createDocumentTitleHead(loaderData?.account.name),
  component: LedgerLayout,
});

function LedgerLayout() {
  return <Outlet />;
}

export function LedgerPageContent() {
  const loaderData = Route.useLoaderData();
  const { accountBookId, accountId } = Route.useParams();
  const { transactionId, period } = Route.useSearch();
  const router = useRouter();
  const userLocale = useUserLocale();
  const isPeriodFilterAvailable = isLedgerPeriodFilterAvailable(
    loaderData.account,
  );

  const navigate = Route.useNavigate();
  const { pendingScrollRef, handleRowDataUpdated } =
    useTransactionScroll<LedgerRow>(transactionId, navigate);
  const maxDate = useMemo(
    () => new Date(loaderData.periodBounds.maxDate),
    [loaderData.periodBounds.maxDate],
  );
  const accountBookMinBookingDate = useMemo(
    () =>
      loaderData.periodBounds.minBookingDate
        ? new Date(loaderData.periodBounds.minBookingDate)
        : null,
    [loaderData.periodBounds.minBookingDate],
  );
  const firstAccountBookingDate = useMemo(
    () =>
      loaderData.firstBookingDate
        ? new Date(loaderData.firstBookingDate)
        : null,
    [loaderData.firstBookingDate],
  );
  const minBookingDate = useMemo(
    () =>
      resolvePeriodFilterMinBookingDate({
        accountType: loaderData.account.type,
        accountBookMinBookingDate,
        firstAccountBookingDate,
      }),
    [
      accountBookMinBookingDate,
      firstAccountBookingDate,
      loaderData.account.type,
    ],
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
  const { selectedPeriod, hasPeriodFilter, setPeriodFilter, controls } =
    useExplicitPeriodFilter({
      available: isPeriodFilterAvailable,
      period,
      locale: userLocale,
      parsePeriod: parseLedgerExplicitPeriod,
      clampPeriod: clampLedgerExplicitPeriodToBounds,
      clampMinDate: accountBookMinBookingDate,
      navigationMinDate: minBookingDate,
      maxDate,
      allowClear: true,
      onPeriodChange,
    });

  const viewProps = useLedgerPageController({
    loaderData,
    accountBookId,
    hasPeriodFilter,
    selectedPeriodValue: selectedPeriod?.value,
    setPeriodFilter,
    pendingScrollRef,
    invalidate: () => {
      router.invalidate();
    },
    onAccountDeleted: ({ tab, mode }) =>
      navigate({
        to: getAccountManagementPath(
          getAccountManagementContext(loaderData.account),
        ),
        params: { accountBookId },
        search: { tab, mode },
      }),
    onOpenImportPage: () =>
      navigate({
        to: "/$accountBookId/$accountId/import-statement",
        params: { accountBookId, accountId },
        search: { period: selectedPeriod?.value },
      }),
  });

  return (
    <Suspense fallback={null}>
      <LedgerPageView
        gainLossSection={
          loaderData.showGainLoss ? (
            <AccountGainLossSection
              accountBookId={accountBookId}
              accountId={accountId}
              period={selectedPeriod?.value}
              refreshKey={loaderData}
              onOpenTransaction={(transactionId) => {
                void navigate({
                  search: (previous) => ({
                    ...previous,
                    period: undefined,
                    transactionId,
                  }),
                });
              }}
            />
          ) : undefined
        }

        {...viewProps}
        periodFilterControls={
          isPeriodFilterAvailable ? (
            <PeriodFilterAction {...controls} />
          ) : undefined
        }
        onRowDataUpdated={handleRowDataUpdated}
      />
    </Suspense>
  );
}
