import { Group, NativeSelect } from "@mantine/core";
import {
  PERIOD_PRESET_LAST_MONTH,
  PERIOD_PRESET_LAST_YEAR,
  PERIOD_PRESET_MTD,
  PERIOD_PRESET_YTD,
} from "./-period-page-types";
import classes from "./-period-page-view.module.css";

export type PeriodSelectorRowProps = {
  selectedPeriodSpecifier: string;
  selectedYear: number;
  selectedMonth: number;
  monthOptions: Array<{ value: string; label: string }>;
  availableYears: number[];
  onPeriodSpecifierChange: (value: string) => void;
  onYearChange: (year: number) => void;
  onMonthChange: (month: number) => void;
};

export function PeriodSelectorRow({
  selectedPeriodSpecifier,
  selectedYear,
  selectedMonth,
  monthOptions,
  availableYears,
  onPeriodSpecifierChange,
  onYearChange,
  onMonthChange,
}: PeriodSelectorRowProps) {
  return (
    <Group align="end" gap="sm" className={classes.periodSelectorRow}>
      <NativeSelect
        label="Period"
        value={selectedPeriodSpecifier}
        onChange={(event) => {
          onPeriodSpecifierChange(event.currentTarget.value);
        }}
      >
        <optgroup label="Monthly">
          <option value={PERIOD_PRESET_MTD}>Month to Date</option>
          <option value={PERIOD_PRESET_LAST_MONTH}>Last Month</option>
          <option value="month">Select Month…</option>
        </optgroup>
        <optgroup label="Yearly">
          <option value={PERIOD_PRESET_YTD}>Year to Date</option>
          <option value={PERIOD_PRESET_LAST_YEAR}>Last Year</option>
          <option value="year">Select Year…</option>
        </optgroup>
      </NativeSelect>

      <NativeSelect
        label="Year"
        disabled={
          selectedPeriodSpecifier !== "month" &&
          selectedPeriodSpecifier !== "year"
        }
        value={String(selectedYear)}
        onChange={(event) => {
          onYearChange(Number(event.currentTarget.value));
        }}
        data={availableYears.map((year) => ({
          value: String(year),
          label: String(year),
        }))}
      />

      {selectedPeriodSpecifier === "month" ? (
        <NativeSelect
          label="Month"
          value={String(selectedMonth)}
          onChange={(event) => {
            onMonthChange(Number(event.currentTarget.value));
          }}
          data={monthOptions}
        />
      ) : null}
    </Group>
  );
}
