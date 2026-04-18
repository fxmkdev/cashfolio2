import {
  ActionIcon,
  Button,
  Card,
  Group,
  Popover,
  SegmentedControl,
  Stack,
  Text,
} from "@mantine/core";
import { MonthPicker, YearPicker } from "@mantine/dates";
import {
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
} from "@tabler/icons-react";
import type { PeriodMode } from "./-period-selector-model";
import classes from "./-period-page-view.module.css";

type PeriodSelectorCardProps = {
  selectedPeriodLabel: string;
  referenceCurrency: string;
  periodMode: PeriodMode;
  pickerOpened: boolean;
  onPickerOpenedChange: (opened: boolean) => void;
  canGoToPreviousPeriod: boolean;
  canGoToNextPeriod: boolean;
  onPeriodModeChange: (nextMode: string) => void;
  onPeriodStep: (step: -1 | 1) => void;
  selectedMonthValue: string;
  selectedYearValue: string;
  minMonthPickerDate: Date;
  maxMonthPickerDate: Date;
  minYearPickerDate: Date;
  maxYearPickerDate: Date;
  onMonthPickerChange: (nextValue: string | null) => void;
  onYearPickerChange: (nextValue: string | null) => void;
};

export function PeriodSelectorCard({
  selectedPeriodLabel,
  referenceCurrency,
  periodMode,
  pickerOpened,
  onPickerOpenedChange,
  canGoToPreviousPeriod,
  canGoToNextPeriod,
  onPeriodModeChange,
  onPeriodStep,
  selectedMonthValue,
  selectedYearValue,
  minMonthPickerDate,
  maxMonthPickerDate,
  minYearPickerDate,
  maxYearPickerDate,
  onMonthPickerChange,
  onYearPickerChange,
}: PeriodSelectorCardProps) {
  return (
    <Card withBorder radius="md" p="lg">
      <Stack gap="sm">
        <Group justify="space-between" align="center">
          <Text fw={600}>Period: {selectedPeriodLabel}</Text>
          <Text c="dimmed" size="sm">
            Amounts shown in {referenceCurrency}
          </Text>
        </Group>

        <Group gap="sm" wrap="nowrap" className={classes.periodSelectorRow}>
          <SegmentedControl
            size="sm"
            aria-label="Period mode"
            value={periodMode}
            onChange={onPeriodModeChange}
            className={classes.periodModeControl}
            data={[
              { label: "Month", value: "month" },
              { label: "Year", value: "year" },
            ]}
          />
          <Group
            gap="xs"
            wrap="nowrap"
            className={classes.periodPickerControlRow}
          >
            <ActionIcon
              variant="default"
              size="input-sm"
              aria-label="Previous period"
              disabled={!canGoToPreviousPeriod}
              onClick={() => onPeriodStep(-1)}
            >
              <IconChevronLeft size={16} />
            </ActionIcon>
            <Popover
              opened={pickerOpened}
              onChange={onPickerOpenedChange}
              position="bottom-start"
              withArrow
            >
              <Popover.Target>
                <Button
                  variant="default"
                  justify="space-between"
                  rightSection={<IconChevronDown size={16} />}
                  onClick={() => onPickerOpenedChange(!pickerOpened)}
                  className={classes.periodPickerTrigger}
                  data-testid="period-picker-trigger"
                >
                  {selectedPeriodLabel}
                </Button>
              </Popover.Target>
              <Popover.Dropdown p="xs">
                {periodMode === "month" ? (
                  <MonthPicker
                    data-testid="period-month-picker"
                    value={selectedMonthValue}
                    defaultDate={selectedMonthValue}
                    onChange={onMonthPickerChange}
                    minDate={minMonthPickerDate}
                    maxDate={maxMonthPickerDate}
                  />
                ) : (
                  <YearPicker
                    data-testid="period-year-picker"
                    value={selectedYearValue}
                    defaultDate={selectedYearValue}
                    onChange={onYearPickerChange}
                    minDate={minYearPickerDate}
                    maxDate={maxYearPickerDate}
                  />
                )}
              </Popover.Dropdown>
            </Popover>
            <ActionIcon
              variant="default"
              size="input-sm"
              aria-label="Next period"
              disabled={!canGoToNextPeriod}
              onClick={() => onPeriodStep(1)}
            >
              <IconChevronRight size={16} />
            </ActionIcon>
          </Group>
        </Group>
      </Stack>
    </Card>
  );
}
