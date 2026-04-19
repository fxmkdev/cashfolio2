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
  IconX,
} from "@tabler/icons-react";
import type { PeriodMode } from "../period/-selector-model";

type LedgerPeriodFilterCardProps = {
  hasPeriodFilter: boolean;
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
  onClearFilter: () => void;
};

export function LedgerPeriodFilterCard({
  hasPeriodFilter,
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
  onClearFilter,
}: LedgerPeriodFilterCardProps) {
  return (
    <Card withBorder radius="md" p="md" mb="md">
      <Stack gap="xs">
        <Text fw={600}>Period Filter</Text>
        <Group gap="sm" wrap="wrap">
          <SegmentedControl
            size="sm"
            aria-label="Ledger period mode"
            value={periodMode}
            onChange={onPeriodModeChange}
            data={[
              { label: "Month", value: "month" },
              { label: "Year", value: "year" },
            ]}
          />
          <Group gap="xs" wrap="nowrap">
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
                >
                  {selectedPeriodLabel}
                </Button>
              </Popover.Target>
              <Popover.Dropdown p="xs">
                {periodMode === "month" ? (
                  <MonthPicker
                    value={selectedMonthValue}
                    defaultDate={monthPickerDefaultValue}
                    onChange={onMonthPickerChange}
                    minDate={minMonthPickerDate}
                    maxDate={maxMonthPickerDate}
                  />
                ) : (
                  <YearPicker
                    value={selectedYearValue}
                    defaultDate={yearPickerDefaultValue}
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
          <Button
            size="sm"
            variant="subtle"
            color="gray"
            leftSection={<IconX size={16} />}
            disabled={!hasPeriodFilter}
            onClick={onClearFilter}
          >
            Clear filter
          </Button>
        </Group>
        <Text c="dimmed" size="sm">
          {hasPeriodFilter
            ? `Showing entries for ${selectedPeriodLabel}`
            : "Showing all entries"}
        </Text>
      </Stack>
    </Card>
  );
}
