import type { ComponentProps } from "react";
import { useMemo, useState } from "react";
import type { PeriodFilterAction } from "../../-period-filter-action";
import type { getPeriodOverview } from "@/server/period";
import { formatMonthPeriodValue } from "@/shared/period";
import {
  buildPeriodSelectorModel,
  getMonthPickerValue,
  getPeriodModeChangeValue,
  getPeriodStepValue,
  getYearPickerValue,
} from "./-selector-model";

type PeriodOverview = Awaited<ReturnType<typeof getPeriodOverview>>;
type PeriodFilterActionProps = ComponentProps<typeof PeriodFilterAction>;

export function useReportPeriodFilterActionProps(args: {
  overview: PeriodOverview;
  onPeriodChange: (nextPeriodValue: string) => void;
}): PeriodFilterActionProps {
  const { overview, onPeriodChange } = args;
  const [pickerOpened, setPickerOpened] = useState(false);
  const periodSelectorModel = useMemo(
    () =>
      buildPeriodSelectorModel({
        selectedGranularity: overview.selectedGranularity,
        selectedYear: overview.selectedYear,
        selectedMonth: overview.selectedMonth,
        minBookingDate: overview.minBookingDate
          ? new Date(overview.minBookingDate)
          : null,
        maxDate: new Date(overview.maxDate),
      }),
    [
      overview.maxDate,
      overview.minBookingDate,
      overview.selectedGranularity,
      overview.selectedMonth,
      overview.selectedYear,
    ],
  );
  const periodMode = periodSelectorModel.periodMode;

  return {
    selectedPeriodLabel: overview.selectedPeriodLabel,
    periodMode,
    pickerOpened,
    onPickerOpenedChange: setPickerOpened,
    canGoToPreviousPeriod: periodSelectorModel.canGoToPreviousPeriod,
    canGoToNextPeriod: periodSelectorModel.canGoToNextPeriod,
    onPeriodModeChange: (nextMode) => {
      const nextPeriodValue = getPeriodModeChangeValue({
        nextMode,
        periodMode,
        selectedYear: overview.selectedYear,
        selectedYearMaxMonth:
          periodSelectorModel.selectedYearMonthBounds.maxMonth,
      });
      if (nextPeriodValue) {
        onPeriodChange(nextPeriodValue);
      }
    },
    onPeriodStep: (step) => {
      setPickerOpened(false);
      const nextPeriodValue = getPeriodStepValue({
        periodMode,
        step,
        selectedMonthIndex: periodSelectorModel.selectedMonthIndex,
        minMonthIndex: periodSelectorModel.minMonthIndex,
        maxMonthIndex: periodSelectorModel.maxMonthIndex,
        selectedYear: overview.selectedYear,
        minYear: periodSelectorModel.minYear,
        maxYear: periodSelectorModel.maxYear,
      });
      if (nextPeriodValue) {
        onPeriodChange(nextPeriodValue);
      }
    },
    selectedMonthValue:
      formatMonthPeriodValue(
        overview.selectedYear,
        periodSelectorModel.selectedMonth,
      ) + "-01",
    selectedYearValue: `${String(overview.selectedYear).padStart(4, "0")}-01-01`,
    monthPickerDefaultValue:
      formatMonthPeriodValue(
        overview.selectedYear,
        periodSelectorModel.selectedMonth,
      ) + "-01",
    yearPickerDefaultValue: `${String(overview.selectedYear).padStart(4, "0")}-01-01`,
    minMonthPickerDate: periodSelectorModel.minMonthPickerDate,
    maxMonthPickerDate: periodSelectorModel.maxMonthPickerDate,
    minYearPickerDate: periodSelectorModel.minYearPickerDate,
    maxYearPickerDate: periodSelectorModel.maxYearPickerDate,
    onMonthPickerChange: (nextValue) => {
      const nextPeriodValue = getMonthPickerValue(nextValue);
      if (!nextPeriodValue) {
        return;
      }
      onPeriodChange(nextPeriodValue);
      setPickerOpened(false);
    },
    onYearPickerChange: (nextValue) => {
      const nextPeriodValue = getYearPickerValue(nextValue);
      if (!nextPeriodValue) {
        return;
      }
      onPeriodChange(nextPeriodValue);
      setPickerOpened(false);
    },
  };
}
