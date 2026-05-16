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
import { PeriodFilterAction } from "../-period-filter-action";
import { useActivityPageController } from "./-page-controller";
import { loadActivityPageData } from "./-page-loader";
import { createDocumentTitleHead } from "@/shared/document-title";
import { useUserLocale } from "@/user-locale-context";
import {
  getDefaultActivityPeriodValue,
  parseActivityExplicitPeriod,
  parseActivitySearch,
  type ActivityRow,
} from "./-page-types";

const ActivityPageView = lazy(async () => {
  const module = await import("./-page-view");
  return { default: module.ActivityPageView };
});

export const Route = createFileRoute("/$accountBookId/activity")({
  validateSearch: parseActivitySearch,
  loaderDeps: ({ search }) => ({
    period: search.period ?? getDefaultActivityPeriodValue(),
  }),
  loader: async ({ params: { accountBookId }, deps: { period } }) => {
    return loadActivityPageData({ accountBookId, period });
  },
  head: () => createDocumentTitleHead("Transactions"),
  component: ActivityLayout,
});

function ActivityLayout() {
  return <Outlet />;
}

export function ActivityPageContent() {
  const loaderData = Route.useLoaderData();
  const { accountBookId } = Route.useParams();
  const { transactionId, period } = Route.useSearch();
  const router = useRouter();
  const userLocale = useUserLocale();
  const [pickerOpened, setPickerOpened] = useState(false);
  const [unfilteredPeriodMode, setUnfilteredPeriodMode] =
    useState<PeriodMode>("month");

  const navigate = Route.useNavigate();
  const { pendingScrollRef, handleRowDataUpdated } =
    useTransactionScroll<ActivityRow>(transactionId, navigate);
  const maxDate = useMemo(
    () => new Date(loaderData.periodBounds.maxDate),
    [loaderData.periodBounds.maxDate],
  );
  const defaultPeriodValue = useMemo(
    () => getDefaultActivityPeriodValue(maxDate),
    [maxDate],
  );
  const minBookingDate = useMemo(
    () =>
      loaderData.periodBounds.minBookingDate
        ? new Date(loaderData.periodBounds.minBookingDate)
        : null,
    [loaderData.periodBounds.minBookingDate],
  );
  const rawSelectedPeriod = useMemo(
    () => parseActivityExplicitPeriod(period ?? defaultPeriodValue, userLocale),
    [defaultPeriodValue, period, userLocale],
  );
  const clampedPeriodValue = useMemo(() => {
    if (!rawSelectedPeriod) {
      return null;
    }
    return clampActivityExplicitPeriodToBounds({
      selectedPeriod: rawSelectedPeriod,
      minBookingDate,
      maxDate,
    });
  }, [maxDate, minBookingDate, rawSelectedPeriod]);
  const selectedPeriod = useMemo(
    () =>
      clampedPeriodValue
        ? parseActivityExplicitPeriod(clampedPeriodValue, userLocale)
        : null,
    [clampedPeriodValue, userLocale],
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
    if (!period || !rawSelectedPeriod) {
      return;
    }
    if (!clampedPeriodValue || period === clampedPeriodValue) {
      return;
    }
    setPeriodFilter(clampedPeriodValue);
  }, [clampedPeriodValue, period, rawSelectedPeriod, setPeriodFilter]);

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
  const hasPeriodFilter = selectedPeriod != null;

  const viewProps = useActivityPageController({
    loaderData,
    accountBookId,
    selectedPeriodValue: selectedPeriod?.value,
    pendingScrollRef,
    invalidate: () => {
      router.invalidate();
    },
  });

  return (
    <Suspense fallback={null}>
      <ActivityPageView
        accountBookId={accountBookId}
        {...viewProps}
        periodFilterControls={
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
          />
        }
        onRowDataUpdated={handleRowDataUpdated}
      />
    </Suspense>
  );
}

export function clampActivityExplicitPeriodToBounds(args: {
  selectedPeriod: NonNullable<ReturnType<typeof parseActivityExplicitPeriod>>;
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
