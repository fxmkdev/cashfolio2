import {
  Button,
  Divider,
  Popover,
  SegmentedControl,
  Stack,
} from "@mantine/core";
import { MonthPicker, YearPicker } from "@mantine/dates";
import {
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconX,
} from "@tabler/icons-react";
import { SplitButtonGroup } from "@/components/split-button";
import type { PeriodMode } from "@/shared/period-selector-model";
import classes from "./-period-filter-action.module.css";

type PeriodFilterActionProps = {
  periodMode: PeriodMode;
  selectedPeriodLabel: string;
  pickerOpened: boolean;
  onPickerOpenedChange: (opened: boolean) => void;
  canGoToPreviousPeriod: boolean;
  canGoToNextPeriod: boolean;
  onPeriodModeChange: (nextMode: string) => void;
  onPeriodStep: (step: -1 | 1) => void;
  selectedMonthValue: string | null;
  selectedYearValue: string | null;
  monthPickerDefaultValue: string;
  yearPickerDefaultValue: string;
  minMonthPickerDate: Date;
  maxMonthPickerDate: Date;
  minYearPickerDate: Date;
  maxYearPickerDate: Date;
  onMonthPickerChange: (nextValue: string | null) => void;
  onYearPickerChange: (nextValue: string | null) => void;
  clearFilterLabel?: string;
  clearFilterDisabled?: boolean;
  onClearFilter?: () => void;
};

export function PeriodFilterAction({
  periodMode,
  selectedPeriodLabel,
  pickerOpened,
  onPickerOpenedChange,
  canGoToPreviousPeriod,
  canGoToNextPeriod,
  onPeriodModeChange,
  onPeriodStep,
  selectedMonthValue,
  selectedYearValue,
  monthPickerDefaultValue,
  yearPickerDefaultValue,
  minMonthPickerDate,
  maxMonthPickerDate,
  minYearPickerDate,
  maxYearPickerDate,
  onMonthPickerChange,
  onYearPickerChange,
  clearFilterLabel = "Clear Filter",
  clearFilterDisabled = true,
  onClearFilter,
}: PeriodFilterActionProps) {
  return (
    <SplitButtonGroup>
      <Button
        variant="default"
        px="xs"
        aria-label="Previous Period"
        disabled={!canGoToPreviousPeriod}
        onClick={() => onPeriodStep(-1)}
      >
        <IconChevronLeft size={16} />
      </Button>
      <Popover
        opened={pickerOpened}
        onChange={onPickerOpenedChange}
        position="bottom-end"
        shadow="md"
        withArrow
      >
        <Popover.Target>
          <Button
            variant="default"
            justify="center"
            onClick={() => onPickerOpenedChange(!pickerOpened)}
            className={classes.trigger}
            data-testid="period-picker-trigger"
          >
            <span className={classes.triggerContent}>
              <span className={classes.triggerLabel}>
                {selectedPeriodLabel}
              </span>
              <IconChevronDown size={16} />
            </span>
          </Button>
        </Popover.Target>
        <Popover.Dropdown p="xs">
          <Stack gap="xs">
            <SegmentedControl
              fullWidth
              size="sm"
              aria-label="Period Mode"
              value={periodMode}
              onChange={onPeriodModeChange}
              data={[
                { label: "Month", value: "month" },
                { label: "Year", value: "year" },
              ]}
            />
            {periodMode === "month" ? (
              <MonthPicker
                data-testid="period-month-picker"
                value={selectedMonthValue}
                defaultDate={monthPickerDefaultValue}
                onChange={onMonthPickerChange}
                minDate={minMonthPickerDate}
                maxDate={maxMonthPickerDate}
              />
            ) : (
              <YearPicker
                data-testid="period-year-picker"
                value={selectedYearValue}
                defaultDate={yearPickerDefaultValue}
                onChange={onYearPickerChange}
                minDate={minYearPickerDate}
                maxDate={maxYearPickerDate}
              />
            )}
            {onClearFilter ? (
              <>
                <Divider />
                <Button
                  fullWidth
                  size="sm"
                  variant="subtle"
                  color="gray"
                  leftSection={<IconX size={16} />}
                  disabled={clearFilterDisabled}
                  onClick={onClearFilter}
                >
                  {clearFilterLabel}
                </Button>
              </>
            ) : null}
          </Stack>
        </Popover.Dropdown>
      </Popover>
      <Button
        variant="default"
        px="xs"
        aria-label="Next Period"
        disabled={!canGoToNextPeriod}
        onClick={() => onPeriodStep(1)}
      >
        <IconChevronRight size={16} />
      </Button>
    </SplitButtonGroup>
  );
}
