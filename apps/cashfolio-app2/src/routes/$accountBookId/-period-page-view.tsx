import {
  ActionIcon,
  Alert,
  Button,
  Card,
  Center,
  Container,
  Flex,
  Group,
  Popover,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  Title,
  useComputedColorScheme,
  useMantineTheme,
} from "@mantine/core";
import {
  IconAlertTriangle,
  IconChartBar,
  IconChartDonut,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconListDetails,
} from "@tabler/icons-react";
import { MonthPicker, YearPicker } from "@mantine/dates";
import { AgCharts } from "ag-charts-react";
import type {
  AgCartesianChartOptions,
  AgDonutSeriesOptions,
  AgPolarChartOptions,
} from "ag-charts-community";
import { useMemo, useState } from "react";
import { ensureChartModulesRegistered } from "../../ag-chart-modules";
import { LinkButton } from "../../components/link-button";
import { TopPageHeader } from "../../components/top-page-header";
import type { getPeriodOverview } from "../../server/period";
import { formatMonthPeriodValue } from "../../shared/period";
import { getDashboardChartThemeColors } from "./-dashboard-chart-theme";
import classes from "./-period-page-view.module.css";

ensureChartModulesRegistered();

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

type PeriodOverview = Awaited<ReturnType<typeof getPeriodOverview>>;

export type PeriodPageViewProps = {
  accountBookId: string;
  overview: PeriodOverview;
  selectedPeriodValue: string;
  onPeriodChange: (nextPeriodValue: string) => void;
};

type BreakdownDatum = PeriodOverview["expenseBreakdown"]["items"][number] & {
  amountLabel: string;
  percentageLabel: string;
};

type StatCardProps = {
  label: string;
  value: string;
  valueColor: "green" | "red";
};

type BreakdownType = "expense" | "income";
type BreakdownChartType = "donut" | "bar";
type PeriodMode = "month" | "year";
type BreakdownBarDatum = {
  label: string;
  amountLabel: string;
  percentageLabel: string;
} & Record<string, number | null | string>;

type BreakdownBarSeriesDefinition = {
  key: string;
  label: string;
};

function getMonthBoundsForYear(args: {
  year: number;
  minBookingDate: Date | null;
  maxDate: Date;
}): { minMonth: number; maxMonth: number } {
  const { year, minBookingDate, maxDate } = args;

  let minMonth = 0;
  let maxMonth = 11;

  if (minBookingDate) {
    if (minBookingDate.getUTCFullYear() === year) {
      minMonth = minBookingDate.getUTCMonth();
    }
  } else if (maxDate.getUTCFullYear() === year) {
    minMonth = maxDate.getUTCMonth();
  }

  if (maxDate.getUTCFullYear() === year) {
    maxMonth = maxDate.getUTCMonth();
  }

  return {
    minMonth,
    maxMonth,
  };
}

function getYearBounds(args: { minBookingDate: Date | null; maxDate: Date }): {
  minYear: number;
  maxYear: number;
} {
  return {
    minYear: args.minBookingDate
      ? args.minBookingDate.getUTCFullYear()
      : args.maxDate.getUTCFullYear(),
    maxYear: args.maxDate.getUTCFullYear(),
  };
}

function toMonthIndex(year: number, month: number): number {
  return year * 12 + month;
}

function fromMonthIndex(monthIndex: number): { year: number; month: number } {
  return {
    year: Math.floor(monthIndex / 12),
    month: monthIndex % 12,
  };
}

function toPickerMonthDate(year: number, month: number): Date {
  return new Date(year, month, 1, 12);
}

function toPickerYearDate(year: number): Date {
  return new Date(year, 0, 1, 12);
}

function StatCard({ label, value, valueColor }: StatCardProps) {
  return (
    <Card withBorder radius="md" p="lg">
      <Stack gap={4} align="center">
        <Text c="dimmed" fw={600} ta="center">
          {label}
        </Text>
        <Text fw={700} fz="xl" c={valueColor}>
          {value}
        </Text>
      </Stack>
    </Card>
  );
}

export function PeriodPageView({
  accountBookId,
  overview,
  selectedPeriodValue,
  onPeriodChange,
}: PeriodPageViewProps) {
  const [selectedBreakdown, setSelectedBreakdown] =
    useState<BreakdownType>("expense");
  const [selectedChartType, setSelectedChartType] =
    useState<BreakdownChartType>("donut");
  const [pickerOpened, setPickerOpened] = useState(false);
  const theme = useMantineTheme();
  const isDarkMode = useComputedColorScheme() === "dark";
  const colors = useMemo(
    () => getDashboardChartThemeColors({ theme, isDarkMode }),
    [theme, isDarkMode],
  );

  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat("en-CH", {
        style: "currency",
        currency: overview.referenceCurrency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    [overview.referenceCurrency],
  );

  const percentageFormatter = useMemo(
    () =>
      new Intl.NumberFormat("en-CH", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }),
    [],
  );

  const minBookingDate = overview.minBookingDate
    ? new Date(overview.minBookingDate)
    : null;
  const maxDate = new Date(overview.maxDate);
  const periodMode: PeriodMode = overview.selectedGranularity;
  const currentYear = maxDate.getUTCFullYear();
  const currentMonth = maxDate.getUTCMonth();
  const minMonthYear = minBookingDate
    ? minBookingDate.getUTCFullYear()
    : currentYear;
  const minMonthValue = minBookingDate
    ? minBookingDate.getUTCMonth()
    : currentMonth;
  const minMonthIndex = toMonthIndex(minMonthYear, minMonthValue);
  const maxMonthIndex = toMonthIndex(currentYear, currentMonth);
  const { minYear, maxYear } = useMemo(
    () => getYearBounds({ minBookingDate, maxDate }),
    [maxDate, minBookingDate],
  );
  const selectedYearMonthBounds = useMemo(
    () =>
      getMonthBoundsForYear({
        year: overview.selectedYear,
        minBookingDate,
        maxDate,
      }),
    [maxDate, minBookingDate, overview.selectedYear],
  );
  const selectedMonth =
    periodMode === "month" && overview.selectedMonth != null
      ? overview.selectedMonth
      : selectedYearMonthBounds.maxMonth;
  const selectedMonthIndex = toMonthIndex(overview.selectedYear, selectedMonth);
  const canGoToPreviousPeriod =
    periodMode === "month"
      ? selectedMonthIndex > minMonthIndex
      : overview.selectedYear > minYear;
  const canGoToNextPeriod =
    periodMode === "month"
      ? selectedMonthIndex < maxMonthIndex
      : overview.selectedYear < maxYear;
  const minMonthPickerDate = toPickerMonthDate(minMonthYear, minMonthValue);
  const maxMonthPickerDate = toPickerMonthDate(currentYear, currentMonth);
  const minYearPickerDate = toPickerYearDate(minYear);
  const maxYearPickerDate = toPickerYearDate(maxYear);

  const activeBreakdown = useMemo(
    () =>
      selectedBreakdown === "expense"
        ? overview.expenseBreakdown
        : overview.incomeBreakdown,
    [overview.expenseBreakdown, overview.incomeBreakdown, selectedBreakdown],
  );

  const breakdownTitle =
    selectedBreakdown === "expense" ? "Expense Breakdown" : "Income Breakdown";
  const breakdownSubtitle =
    selectedBreakdown === "expense"
      ? "Top-level expense groups for the selected period"
      : "Top-level income groups for the selected period";
  const emptyBreakdownMessage =
    selectedBreakdown === "expense"
      ? "No expense bookings were found for this period."
      : "No income bookings were found for this period.";

  const chartData = useMemo<BreakdownDatum[]>(
    () =>
      activeBreakdown.items.map((item) => ({
        ...item,
        amountLabel: currencyFormatter.format(item.amount),
        percentageLabel: `${percentageFormatter.format(item.percentage)}%`,
      })),
    [activeBreakdown.items, currencyFormatter, percentageFormatter],
  );

  const totalBreakdownAmountLabel = useMemo(
    () => currencyFormatter.format(activeBreakdown.totalAmount),
    [activeBreakdown.totalAmount, currencyFormatter],
  );

  const hasBreakdown = chartData.length > 0;
  const amountCompactFormatter = useMemo(
    () =>
      new Intl.NumberFormat("en-CH", {
        notation: "compact",
        maximumFractionDigits: 1,
      }),
    [],
  );
  const barSeriesDefinitions = useMemo<BreakdownBarSeriesDefinition[]>(
    () =>
      chartData.map((item, index) => ({
        key: `amount_${index}`,
        label: item.label,
      })),
    [chartData],
  );
  const barChartData = useMemo<BreakdownBarDatum[]>(
    () =>
      chartData.map((item, itemIndex) => {
        const row: BreakdownBarDatum = {
          label: item.label,
          amountLabel: item.amountLabel,
          percentageLabel: item.percentageLabel,
        };

        for (const seriesDefinition of barSeriesDefinitions) {
          row[seriesDefinition.key] = null;
        }

        row[barSeriesDefinitions[itemIndex].key] = item.amount;

        return row;
      }),
    [barSeriesDefinitions, chartData],
  );

  const donutSeries = useMemo<AgDonutSeriesOptions<BreakdownDatum>[]>(
    () => [
      {
        type: "donut",
        angleKey: "amount",
        calloutLabelKey: "label",
        sectorLabelKey: "percentageLabel",
        innerRadiusRatio: 0.7,
        outerRadiusRatio: 0.95,
        calloutLabel: {
          minAngle: 10,
        },
        innerLabels: [
          {
            text: totalBreakdownAmountLabel,
            color: colors.chartTextColor,
            fontWeight: 600,
            fontSize: 18,
          },
        ],
        tooltip: {
          renderer: ({ datum }) => {
            const item = datum as BreakdownDatum;

            return {
              heading: item.label,
              data: [
                {
                  label: "Share",
                  value: item.percentageLabel,
                },
                {
                  label: "Amount",
                  value: item.amountLabel,
                },
                {
                  label: "Total",
                  value: totalBreakdownAmountLabel,
                },
              ],
            };
          },
        },
      },
    ],
    [colors.chartTextColor, totalBreakdownAmountLabel],
  );

  const donutChartOptions = useMemo<AgPolarChartOptions<BreakdownDatum>>(
    () => ({
      data: chartData,
      height: 500,
      background: {
        visible: false,
      },
      theme: {
        params: {
          textColor: colors.chartTextColor,
          foregroundColor: colors.chartTextColor,
          borderColor: colors.themeBorderColor,
          tooltipBackgroundColor: colors.tooltipBackgroundColor,
          tooltipBorder: true,
          tooltipTextColor: colors.tooltipTextColor,
          tooltipSubtleTextColor: colors.tooltipSubtleTextColor,
        },
      },
      legend: {
        position: "bottom",
      },
      series: donutSeries,
    }),
    [chartData, colors, donutSeries],
  );
  const barChartOptions = useMemo<AgCartesianChartOptions>(
    () => ({
      data: barChartData,
      height: 500,
      background: {
        visible: false,
      },
      theme: {
        params: {
          textColor: colors.chartTextColor,
          foregroundColor: colors.chartTextColor,
          borderColor: colors.themeBorderColor,
          tooltipBackgroundColor: colors.tooltipBackgroundColor,
          tooltipBorder: true,
          tooltipTextColor: colors.tooltipTextColor,
          tooltipSubtleTextColor: colors.tooltipSubtleTextColor,
        },
      },
      legend: {
        enabled: true,
        position: "bottom",
      },
      series: barSeriesDefinitions.map((seriesDefinition) => ({
        type: "bar",
        direction: "vertical",
        grouped: false,
        widthRatio: 0.72,
        xKey: "label",
        yKey: seriesDefinition.key,
        yName: seriesDefinition.label,
        legendItemName: seriesDefinition.label,
        tooltip: {
          renderer: ({ datum }) => {
            const item = datum as BreakdownBarDatum;

            return {
              heading: item.label,
              data: [
                {
                  label: "Share",
                  value: item.percentageLabel,
                },
                {
                  label: "Amount",
                  value: item.amountLabel,
                },
                {
                  label: "Total",
                  value: totalBreakdownAmountLabel,
                },
              ],
            };
          },
        },
      })),
      axes: {
        x: {
          type: "category",
          label: {
            rotation: -25,
          },
        },
        y: {
          type: "number",
          label: {
            formatter: ({ value }) =>
              amountCompactFormatter.format(Number(value)),
          },
        },
      },
    }),
    [
      amountCompactFormatter,
      barChartData,
      barSeriesDefinitions,
      colors,
      totalBreakdownAmountLabel,
    ],
  );
  const chartOptions =
    selectedChartType === "donut" ? donutChartOptions : barChartOptions;

  const statCards: StatCardProps[] = [
    {
      label: "Total Return",
      value: currencyFormatter.format(overview.stats.totalReturn),
      valueColor: overview.stats.totalReturn >= 0 ? "green" : "red",
    },
    {
      label: "Savings",
      value: currencyFormatter.format(overview.stats.savings),
      valueColor: overview.stats.savings >= 0 ? "green" : "red",
    },
    {
      label: "Total Income",
      value: currencyFormatter.format(overview.stats.totalIncome),
      valueColor: "green" as const,
    },
    {
      label: "Total Expenses",
      value: currencyFormatter.format(overview.stats.totalExpenses),
      valueColor: "red" as const,
    },
    {
      label: "Gains / Losses",
      value: currencyFormatter.format(overview.stats.gainsLosses),
      valueColor: overview.stats.gainsLosses >= 0 ? "green" : "red",
    },
  ];

  const handlePeriodModeChange = (nextMode: string) => {
    if (nextMode !== "month" && nextMode !== "year") {
      return;
    }

    setPickerOpened(false);
    if (nextMode === periodMode) {
      return;
    }

    if (nextMode === "year") {
      onPeriodChange(String(overview.selectedYear));
      return;
    }

    onPeriodChange(
      formatMonthPeriodValue(
        overview.selectedYear,
        selectedYearMonthBounds.maxMonth,
      ),
    );
  };

  const handlePeriodStep = (step: -1 | 1) => {
    setPickerOpened(false);
    if (periodMode === "month") {
      const nextMonthIndex = Math.min(
        Math.max(selectedMonthIndex + step, minMonthIndex),
        maxMonthIndex,
      );
      if (nextMonthIndex === selectedMonthIndex) {
        return;
      }

      const { year, month } = fromMonthIndex(nextMonthIndex);
      onPeriodChange(formatMonthPeriodValue(year, month));
      return;
    }

    const nextYear = Math.min(
      Math.max(overview.selectedYear + step, minYear),
      maxYear,
    );
    if (nextYear === overview.selectedYear) {
      return;
    }
    onPeriodChange(String(nextYear));
  };

  const handleMonthPickerChange = (nextValue: string | null) => {
    if (!nextValue) {
      return;
    }
    const [yearText, monthText] = nextValue.split("-");
    const year = Number(yearText);
    const monthOneBased = Number(monthText);
    if (!Number.isFinite(year) || !Number.isFinite(monthOneBased)) {
      return;
    }
    if (monthOneBased < 1 || monthOneBased > 12) {
      return;
    }
    onPeriodChange(formatMonthPeriodValue(year, monthOneBased - 1));
    setPickerOpened(false);
  };

  const handleYearPickerChange = (nextValue: string | null) => {
    if (!nextValue) {
      return;
    }
    const [yearText] = nextValue.split("-");
    const year = Number(yearText);
    if (!Number.isFinite(year)) {
      return;
    }
    onPeriodChange(String(year));
    setPickerOpened(false);
  };

  return (
    <Container fluid py="xl" px="xl">
      <TopPageHeader
        heading={<Title order={2}>Period</Title>}
        actions={
          <LinkButton
            variant="default"
            leftSection={<IconListDetails size={16} />}
            to="/$accountBookId/accounts"
            params={{ accountBookId }}
            search={{ tab: "ASSET", mode: "active" }}
          >
            Accounts
          </LinkButton>
        }
      />

      <Stack gap="lg">
        <Card withBorder radius="md" p="lg">
          <Stack gap="sm">
            <Group justify="space-between" align="center">
              <Text fw={600}>Period: {overview.selectedPeriodLabel}</Text>
              <Text c="dimmed" size="sm">
                Amounts shown in {overview.referenceCurrency}
              </Text>
            </Group>

            <Group gap="sm" wrap="nowrap" className={classes.periodSelectorRow}>
              <SegmentedControl
                size="sm"
                aria-label="Period mode"
                value={periodMode}
                onChange={handlePeriodModeChange}
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
                  onClick={() => handlePeriodStep(-1)}
                >
                  <IconChevronLeft size={16} />
                </ActionIcon>
                <Popover
                  opened={pickerOpened}
                  onChange={setPickerOpened}
                  position="bottom-start"
                  withArrow
                  withinPortal={false}
                >
                  <Popover.Target>
                    <Button
                      variant="default"
                      justify="space-between"
                      rightSection={<IconChevronDown size={16} />}
                      onClick={() => setPickerOpened((opened) => !opened)}
                      className={classes.periodPickerTrigger}
                      aria-label="Select period"
                    >
                      {overview.selectedPeriodLabel}
                    </Button>
                  </Popover.Target>
                  <Popover.Dropdown p="xs">
                    {periodMode === "month" ? (
                      <MonthPicker
                        data-testid="period-month-picker"
                        value={formatMonthPeriodValue(
                          overview.selectedYear,
                          selectedMonth,
                        )}
                        onChange={handleMonthPickerChange}
                        minDate={minMonthPickerDate}
                        maxDate={maxMonthPickerDate}
                      />
                    ) : (
                      <YearPicker
                        data-testid="period-year-picker"
                        value={`${String(overview.selectedYear).padStart(4, "0")}-01-01`}
                        onChange={handleYearPickerChange}
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
                  onClick={() => handlePeriodStep(1)}
                >
                  <IconChevronRight size={16} />
                </ActionIcon>
              </Group>
            </Group>
          </Stack>
        </Card>

        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3, xl: 5 }} spacing="lg">
          {statCards.map((card) => (
            <StatCard
              key={card.label}
              label={card.label}
              value={card.value}
              valueColor={card.valueColor}
            />
          ))}
        </SimpleGrid>

        <Card withBorder radius="md" p="lg">
          <Stack gap="sm">
            <Group justify="space-between" align="center">
              <Title order={4}>{breakdownTitle}</Title>
              <Flex gap="md" wrap="wrap" justify="flex-end">
                <SegmentedControl
                  size="sm"
                  aria-label="Breakdown chart type"
                  value={selectedChartType}
                  onChange={(value) =>
                    setSelectedChartType(value as BreakdownChartType)
                  }
                  data={[
                    {
                      label: (
                        <Center style={{ gap: 6 }}>
                          <IconChartDonut size={16} />
                          Donut
                        </Center>
                      ),
                      value: "donut",
                    },
                    {
                      label: (
                        <Center style={{ gap: 6 }}>
                          <IconChartBar size={16} />
                          Bar
                        </Center>
                      ),
                      value: "bar",
                    },
                  ]}
                />
                <SegmentedControl
                  size="sm"
                  value={selectedBreakdown}
                  onChange={(value) =>
                    setSelectedBreakdown(value as BreakdownType)
                  }
                  data={[
                    { label: "Expense", value: "expense" },
                    { label: "Income", value: "income" },
                  ]}
                />
              </Flex>
            </Group>
            <Text c="dimmed" size="sm">
              {breakdownSubtitle}
            </Text>

            {hasBreakdown ? (
              <div className={classes.chartContainer}>
                <AgCharts options={chartOptions} />
              </div>
            ) : (
              <Text c="dimmed" mt="md">
                {emptyBreakdownMessage}
              </Text>
            )}
          </Stack>

          {overview.skippedBookingsCount > 0 ? (
            <Alert
              mt="md"
              variant="light"
              color="yellow"
              icon={<IconAlertTriangle size={16} />}
              title="Partial data"
            >
              {overview.skippedBookingsCount} valuation-related item(s) were
              skipped because valuation data was unavailable.
            </Alert>
          ) : null}
        </Card>
      </Stack>

      {selectedPeriodValue !== overview.selectedPeriodValue ? (
        <Text c="dimmed" mt="sm" size="xs">
          Showing nearest supported period for the requested value.
        </Text>
      ) : null}
    </Container>
  );
}
