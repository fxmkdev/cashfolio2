import { createFileRoute, Outlet, useRouter } from "@tanstack/react-router";
import { Suspense, lazy, useMemo, useState } from "react";
import { AccountType } from "@/.prisma-client/enums";
import { useTransactionScroll } from "@/hooks/use-transaction-scroll";
import { formatMonthPeriodValue } from "@/shared/period";
import { loadLedgerPageData } from "./-page-loader";
import { useLedgerPageController } from "./-page-controller";
import { LedgerPeriodFilterCard } from "./-period-filter-card";
import {
  parseLedgerExplicitPeriod,
  parseLedgerSearch,
  type LedgerRow,
} from "./-page-types";
import { LedgerViewSegmentedControl } from "./-view-segmented-control";
import {
  buildPeriodSelectorModel,
  getMonthPickerValue,
  getPeriodModeChangeValue,
  getPeriodStepValue,
  getYearPickerValue,
} from "../period/-selector-model";

const LedgerPageView = lazy(async () => {
  const module = await import("./-page-view");
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
  component: LedgerLayout,
});

function LedgerLayout() {
  return <Outlet />;
}

export function LedgerPageContent() {
  const loaderData = Route.useLoaderData();
  const { accountBookId } = Route.useParams();
  const { transactionId, period } = Route.useSearch();
  const router = useRouter();
  const [pickerOpened, setPickerOpened] = useState(false);

  const navigate = Route.useNavigate();
  const { pendingScrollRef, handleRowDataUpdated } =
    useTransactionScroll<LedgerRow>(transactionId, navigate);
  const selectedPeriod = useMemo(
    () => parseLedgerExplicitPeriod(period),
    [period],
  );
  const maxDate = useMemo(
    () => new Date(loaderData.periodBounds.maxDate),
    [loaderData.periodBounds.maxDate],
  );
  const minBookingDate = useMemo(
    () =>
      loaderData.periodBounds.minBookingDate
        ? new Date(loaderData.periodBounds.minBookingDate)
        : null,
    [loaderData.periodBounds.minBookingDate],
  );
  const periodMode = selectedPeriod?.granularity ?? "month";
  const selectedYear = selectedPeriod?.year ?? maxDate.getUTCFullYear();
  const selectedMonth = selectedPeriod?.month ?? maxDate.getUTCMonth();
  const periodSelectorModel = useMemo(
    () =>
      buildPeriodSelectorModel({
        selectedGranularity: periodMode,
        selectedYear,
        selectedMonth: periodMode === "month" ? selectedMonth : null,
        minBookingDate,
        maxDate,
      }),
    [maxDate, minBookingDate, periodMode, selectedMonth, selectedYear],
  );
  const hasPeriodFilter = selectedPeriod != null;
  const setPeriodFilter = (nextPeriodValue: string | undefined) => {
    navigate({
      search: (previousSearch) => ({
        ...previousSearch,
        period: nextPeriodValue,
        transactionId: undefined,
      }),
    });
  };

  const viewProps = useLedgerPageController({
    loaderData,
    accountBookId,
    hasPeriodFilter,
    pendingScrollRef,
    invalidate: () => {
      router.invalidate();
    },
  });

  const isBalanceChartAvailable =
    viewProps.account.type === AccountType.ASSET ||
    viewProps.account.type === AccountType.LIABILITY;

  return (
    <Suspense fallback={null}>
      <LedgerPageView
        accountBookId={accountBookId}
        {...viewProps}
        periodFilterControls={
          <LedgerPeriodFilterCard
            hasPeriodFilter={hasPeriodFilter}
            periodMode={periodMode}
            selectedPeriodLabel={selectedPeriod?.label ?? "All periods"}
            pickerOpened={pickerOpened}
            onPickerOpenedChange={setPickerOpened}
            canGoToPreviousPeriod={
              hasPeriodFilter && periodSelectorModel.canGoToPreviousPeriod
            }
            canGoToNextPeriod={
              hasPeriodFilter && periodSelectorModel.canGoToNextPeriod
            }
            onPeriodModeChange={(nextMode) => {
              setPickerOpened(false);
              const nextPeriodValue = getPeriodModeChangeValue({
                nextMode,
                periodMode,
                selectedYear,
                selectedYearMaxMonth:
                  periodSelectorModel.selectedYearMonthBounds.maxMonth,
              });
              if (!nextPeriodValue) {
                return;
              }
              setPeriodFilter(nextPeriodValue);
            }}
            onPeriodStep={(step) => {
              if (!hasPeriodFilter) {
                return;
              }

              setPickerOpened(false);
              const nextPeriodValue = getPeriodStepValue({
                periodMode,
                step,
                selectedMonthIndex: periodSelectorModel.selectedMonthIndex,
                minMonthIndex: periodSelectorModel.minMonthIndex,
                maxMonthIndex: periodSelectorModel.maxMonthIndex,
                selectedYear,
                minYear: periodSelectorModel.minYear,
                maxYear: periodSelectorModel.maxYear,
              });
              if (!nextPeriodValue) {
                return;
              }
              setPeriodFilter(nextPeriodValue);
            }}
            selectedMonthValue={
              formatMonthPeriodValue(selectedYear, selectedMonth) + "-01"
            }
            selectedYearValue={`${String(selectedYear).padStart(4, "0")}-01-01`}
            minMonthPickerDate={periodSelectorModel.minMonthPickerDate}
            maxMonthPickerDate={periodSelectorModel.maxMonthPickerDate}
            minYearPickerDate={periodSelectorModel.minYearPickerDate}
            maxYearPickerDate={periodSelectorModel.maxYearPickerDate}
            onMonthPickerChange={(nextValue) => {
              const nextPeriodValue = getMonthPickerValue(nextValue);
              if (!nextPeriodValue) {
                return;
              }
              setPeriodFilter(nextPeriodValue);
              setPickerOpened(false);
            }}
            onYearPickerChange={(nextValue) => {
              const nextPeriodValue = getYearPickerValue(nextValue);
              if (!nextPeriodValue) {
                return;
              }
              setPeriodFilter(nextPeriodValue);
              setPickerOpened(false);
            }}
            onClearFilter={() => {
              setPickerOpened(false);
              setPeriodFilter(undefined);
            }}
          />
        }
        viewSwitcher={
          isBalanceChartAvailable ? (
            <LedgerViewSegmentedControl
              accountBookId={accountBookId}
              accountId={viewProps.account.id}
              view="ledger"
            />
          ) : undefined
        }
        onRowDataUpdated={handleRowDataUpdated}
      />
    </Suspense>
  );
}
