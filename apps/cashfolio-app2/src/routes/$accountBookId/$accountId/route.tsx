import { createFileRoute, Outlet, useRouter } from "@tanstack/react-router";
import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useTransactionScroll } from "@/hooks/use-transaction-scroll";
import { formatMonthPeriodValue } from "@/shared/period";
import {
  buildPeriodSelectorModel,
  getMonthBoundsForYear,
  getMonthPickerValue,
  getPeriodModeChangeValue,
  getPeriodStepValue,
  getYearBounds,
  getYearPickerValue,
  type PeriodMode,
} from "@/shared/period-selector-model";
import {
  isLedgerPeriodFilterAvailable,
  loadLedgerPageData,
} from "./-page-loader";
import { createDocumentTitleHead } from "@/shared/document-title";
import { useLedgerPageController } from "./-page-controller";
import { PeriodFilterAction } from "../-period-filter-action";
import {
  parseLedgerExplicitPeriod,
  parseLedgerSearch,
  type LedgerRow,
} from "./-page-types";
import { resolvePeriodFilterMinBookingDate } from "./-period-filter-min-booking-date";

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
  head: ({ loaderData }) => createDocumentTitleHead(loaderData?.account.name),
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
  const [unfilteredPeriodMode, setUnfilteredPeriodMode] =
    useState<PeriodMode>("month");
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
  const rawSelectedPeriod = useMemo(
    () => (isPeriodFilterAvailable ? parseLedgerExplicitPeriod(period) : null),
    [isPeriodFilterAvailable, period],
  );
  const clampedPeriodValue = useMemo(() => {
    if (!rawSelectedPeriod) {
      return null;
    }
    return clampLedgerExplicitPeriodToBounds({
      selectedPeriod: rawSelectedPeriod,
      minBookingDate,
      maxDate,
    });
  }, [maxDate, minBookingDate, rawSelectedPeriod]);
  const selectedPeriod = useMemo(
    () =>
      clampedPeriodValue ? parseLedgerExplicitPeriod(clampedPeriodValue) : null,
    [clampedPeriodValue],
  );
  useEffect(() => {
    if (!selectedPeriod) {
      return;
    }
    setUnfilteredPeriodMode(selectedPeriod.granularity);
  }, [selectedPeriod]);
  const setPeriodFilter = useCallback(
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
  useEffect(() => {
    if (!isPeriodFilterAvailable || !period || !rawSelectedPeriod) {
      return;
    }
    if (!clampedPeriodValue || period === clampedPeriodValue) {
      return;
    }
    setPeriodFilter(clampedPeriodValue);
  }, [
    clampedPeriodValue,
    isPeriodFilterAvailable,
    period,
    rawSelectedPeriod,
    setPeriodFilter,
  ]);
  const periodMode = selectedPeriod?.granularity ?? unfilteredPeriodMode;
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
  const hasPeriodFilter = isPeriodFilterAvailable && selectedPeriod != null;

  const viewProps = useLedgerPageController({
    loaderData,
    accountBookId,
    hasPeriodFilter,
    selectedPeriodValue: selectedPeriod?.value,
    pendingScrollRef,
    invalidate: () => {
      router.invalidate();
    },
    onAccountDeleted: ({ tab, mode }) =>
      navigate({
        to: "/$accountBookId/accounts",
        params: { accountBookId },
        search: { tab, mode },
      }),
  });

  return (
    <Suspense fallback={null}>
      <LedgerPageView
        {...viewProps}
        periodFilterControls={
          isPeriodFilterAvailable ? (
            <PeriodFilterAction
              periodMode={periodMode}
              selectedPeriodLabel={selectedPeriod?.label ?? "All Periods"}
              pickerOpened={pickerOpened}
              onPickerOpenedChange={setPickerOpened}
              canGoToPreviousPeriod={
                hasPeriodFilter && periodSelectorModel.canGoToPreviousPeriod
              }
              canGoToNextPeriod={
                hasPeriodFilter && periodSelectorModel.canGoToNextPeriod
              }
              onPeriodModeChange={(nextMode) => {
                const nextPeriodMode = nextMode as PeriodMode;
                if (!hasPeriodFilter) {
                  setUnfilteredPeriodMode(nextPeriodMode);
                  return;
                }

                const nextPeriodValue = getPeriodModeChangeValue({
                  nextMode: nextPeriodMode,
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
                hasPeriodFilter
                  ? formatMonthPeriodValue(selectedYear, selectedMonth) + "-01"
                  : null
              }
              selectedYearValue={
                hasPeriodFilter
                  ? `${String(selectedYear).padStart(4, "0")}-01-01`
                  : null
              }
              monthPickerDefaultValue={
                formatMonthPeriodValue(selectedYear, selectedMonth) + "-01"
              }
              yearPickerDefaultValue={`${String(selectedYear).padStart(4, "0")}-01-01`}
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
              clearFilterDisabled={!hasPeriodFilter}
              onClearFilter={() => {
                setPickerOpened(false);
                setPeriodFilter(undefined);
              }}
            />
          ) : undefined
        }
        onRowDataUpdated={handleRowDataUpdated}
      />
    </Suspense>
  );
}

function clampLedgerExplicitPeriodToBounds(args: {
  selectedPeriod: NonNullable<ReturnType<typeof parseLedgerExplicitPeriod>>;
  minBookingDate: Date | null;
  maxDate: Date;
}): string {
  const { selectedPeriod, minBookingDate, maxDate } = args;
  const { minYear, maxYear } = getYearBounds({ minBookingDate, maxDate });
  const clampedYear = Math.min(Math.max(selectedPeriod.year, minYear), maxYear);

  if (selectedPeriod.granularity === "year") {
    return String(clampedYear).padStart(4, "0");
  }

  const { minMonth, maxMonth } = getMonthBoundsForYear({
    year: clampedYear,
    minBookingDate,
    maxDate,
  });
  const clampedMonth = Math.min(
    Math.max(selectedPeriod.month ?? maxMonth, minMonth),
    maxMonth,
  );

  return formatMonthPeriodValue(clampedYear, clampedMonth);
}
