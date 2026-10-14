import { useCallback, useEffect, useMemo, useState } from "react";
import { formatMonthPeriodValue } from "@/shared/period";
import {
  buildPeriodSelectorModel,
  getMonthPickerValue,
  getPeriodModeChangeValue,
  getPeriodStepValue,
  getYearPickerValue,
  type PeriodMode,
} from "@/shared/period-selector-model";
import type { UserLocale } from "@/user-locale";
import type { PeriodFilterActionProps } from "./-period-filter-action";

type PeriodSelection = {
  value: string;
  granularity: PeriodMode;
  year: number;
  month: number | null;
  label: string;
};

type ExplicitPeriodFilterOptions = {
  available: boolean;
  period: string | undefined;
  defaultPeriod?: string;
  locale: UserLocale;
  parsePeriod: (
    value: string | undefined,
    locale: UserLocale,
  ) => PeriodSelection | null;
  clampPeriod: (args: {
    selectedPeriod: PeriodSelection;
    minBookingDate: Date | null;
    maxDate: Date;
  }) => string;
  clampMinDate: Date | null;
  navigationMinDate: Date | null;
  maxDate: Date;
  allowClear: boolean;
  onPeriodChange: (value: string | undefined) => void;
};

export function useExplicitPeriodFilter({
  available,
  period,
  defaultPeriod,
  locale,
  parsePeriod,
  clampPeriod,
  clampMinDate,
  navigationMinDate,
  maxDate,
  allowClear,
  onPeriodChange,
}: ExplicitPeriodFilterOptions) {
  const [pickerOpened, setPickerOpened] = useState(false);
  const [unfilteredPeriodMode, setUnfilteredPeriodMode] =
    useState<PeriodMode>("month");
  const rawSelectedPeriod = useMemo(
    () => (available ? parsePeriod(period ?? defaultPeriod, locale) : null),
    [available, defaultPeriod, locale, parsePeriod, period],
  );
  const clampedPeriodValue = useMemo(
    () =>
      rawSelectedPeriod
        ? clampPeriod({
            selectedPeriod: rawSelectedPeriod,
            minBookingDate: clampMinDate,
            maxDate,
          })
        : null,
    [clampMinDate, clampPeriod, maxDate, rawSelectedPeriod],
  );
  const selectedPeriod = useMemo(
    () => (clampedPeriodValue ? parsePeriod(clampedPeriodValue, locale) : null),
    [clampedPeriodValue, locale, parsePeriod],
  );

  useEffect(() => {
    if (selectedPeriod) setUnfilteredPeriodMode(selectedPeriod.granularity);
  }, [selectedPeriod]);
  const setPeriodFilter = useCallback(
    (value: string | undefined) => onPeriodChange(value),
    [onPeriodChange],
  );
  useEffect(() => {
    if (
      available &&
      period &&
      rawSelectedPeriod &&
      clampedPeriodValue &&
      period !== clampedPeriodValue
    ) {
      setPeriodFilter(clampedPeriodValue);
    }
  }, [
    available,
    clampedPeriodValue,
    period,
    rawSelectedPeriod,
    setPeriodFilter,
  ]);

  const periodMode = selectedPeriod?.granularity ?? unfilteredPeriodMode;
  const selectedYear = selectedPeriod?.year ?? maxDate.getUTCFullYear();
  const selectedMonth = selectedPeriod?.month ?? maxDate.getUTCMonth();
  const model = useMemo(
    () =>
      buildPeriodSelectorModel({
        selectedGranularity: periodMode,
        selectedYear,
        selectedMonth: periodMode === "month" ? selectedMonth : null,
        minBookingDate: navigationMinDate,
        maxDate,
      }),
    [maxDate, navigationMinDate, periodMode, selectedMonth, selectedYear],
  );
  const hasPeriodFilter = available && selectedPeriod != null;
  const monthPickerDefaultValue =
    formatMonthPeriodValue(selectedYear, selectedMonth) + "-01";
  const yearPickerDefaultValue = `${String(selectedYear).padStart(4, "0")}-01-01`;

  const controls: PeriodFilterActionProps = {
    periodMode,
    selectedPeriodLabel: selectedPeriod?.label ?? "All Periods",
    pickerOpened,
    onPickerOpenedChange: setPickerOpened,
    canGoToPreviousPeriod: hasPeriodFilter && model.canGoToPreviousPeriod,
    canGoToNextPeriod: hasPeriodFilter && model.canGoToNextPeriod,
    onPeriodModeChange: (nextMode) => {
      if (!hasPeriodFilter) {
        if (nextMode === "month" || nextMode === "year") {
          setUnfilteredPeriodMode(nextMode);
        }
        return;
      }
      const value = getPeriodModeChangeValue({
        nextMode,
        periodMode,
        selectedYear,
        selectedYearMaxMonth: model.selectedYearMonthBounds.maxMonth,
      });
      if (value) setPeriodFilter(value);
    },
    onPeriodStep: (step) => {
      if (!hasPeriodFilter) return;
      setPickerOpened(false);
      const value = getPeriodStepValue({ ...model, step, selectedYear });
      if (value) setPeriodFilter(value);
    },
    selectedMonthValue: hasPeriodFilter ? monthPickerDefaultValue : null,
    selectedYearValue: hasPeriodFilter ? yearPickerDefaultValue : null,
    monthPickerDefaultValue,
    yearPickerDefaultValue,
    minMonthPickerDate: model.minMonthPickerDate,
    maxMonthPickerDate: model.maxMonthPickerDate,
    minYearPickerDate: model.minYearPickerDate,
    maxYearPickerDate: model.maxYearPickerDate,
    onMonthPickerChange: (nextValue) => {
      const value = getMonthPickerValue(nextValue);
      if (!value) return;
      setPeriodFilter(value);
      setPickerOpened(false);
    },
    onYearPickerChange: (nextValue) => {
      const value = getYearPickerValue(nextValue);
      if (!value) return;
      setPeriodFilter(value);
      setPickerOpened(false);
    },
    ...(allowClear
      ? {
          clearFilterDisabled: !hasPeriodFilter,
          onClearFilter: () => {
            setPickerOpened(false);
            setPeriodFilter(undefined);
          },
        }
      : {}),
  };

  return { selectedPeriod, hasPeriodFilter, setPeriodFilter, controls };
}
