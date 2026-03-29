import {
  Alert,
  Card,
  Container,
  Flex,
  Group,
  NativeSelect,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  Title,
  VisuallyHidden,
  useComputedColorScheme,
  useMantineTheme,
} from "@mantine/core";
import {
  IconAlertTriangle,
  IconChartBar,
  IconChartDonut,
  IconListDetails,
} from "@tabler/icons-react";
import { AgCharts } from "ag-charts-react";
import type {
  AgCartesianChartOptions,
  AgDonutSeriesOptions,
  AgPolarChartOptions,
} from "ag-charts-community";
import { useMemo, useState } from "react";
import { ensureChartModulesRegistered } from "../../ag-chart-modules";
import { LinkButton } from "../../components/link-button";
import type { getPeriodOverview } from "../../server/period";
import { formatMonthPeriodValue } from "../../shared/period";
import {
  PERIOD_PRESET_LAST_MONTH,
  PERIOD_PRESET_LAST_YEAR,
  PERIOD_PRESET_MTD,
  PERIOD_PRESET_YTD,
} from "./-period-page-types";
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

function getMonthBoundsForYear(args: {
  year: number;
  minBookingDate: Date | null;
  maxDate: Date;
}): { minMonth: number; maxMonth: number } {
  const { year, minBookingDate, maxDate } = args;

  let minMonth = 0;
  let maxMonth = 11;

  if (minBookingDate && minBookingDate.getUTCFullYear() === year) {
    minMonth = minBookingDate.getUTCMonth();
  }

  if (maxDate.getUTCFullYear() === year) {
    maxMonth = maxDate.getUTCMonth();
  }

  return {
    minMonth,
    maxMonth,
  };
}

function buildMonthOptions(args: {
  year: number;
  minBookingDate: Date | null;
  maxDate: Date;
}): Array<{ value: string; label: string }> {
  const { minMonth, maxMonth } = getMonthBoundsForYear(args);
  const options: Array<{ value: string; label: string }> = [];

  for (let month = maxMonth; month >= minMonth; month -= 1) {
    options.push({
      value: String(month),
      label: MONTH_NAMES[month],
    });
  }

  return options;
}

function clampMonth(args: {
  year: number;
  month: number;
  minBookingDate: Date | null;
  maxDate: Date;
}): number {
  const { minMonth, maxMonth } = getMonthBoundsForYear(args);
  return Math.min(Math.max(args.month, minMonth), maxMonth);
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

  const selectedMonth =
    overview.selectedGranularity === "month" && overview.selectedMonth != null
      ? overview.selectedMonth
      : maxDate.getUTCMonth();

  const monthOptions = useMemo(
    () =>
      buildMonthOptions({
        year: overview.selectedYear,
        minBookingDate,
        maxDate,
      }),
    [maxDate, minBookingDate, overview.selectedYear],
  );

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
  const barSeriesName = selectedBreakdown === "expense" ? "Expense" : "Income";

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
      data: chartData,
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
        enabled: false,
      },
      series: [
        {
          type: "bar",
          direction: "vertical",
          xKey: "label",
          yKey: "amount",
          yName: barSeriesName,
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
      barSeriesName,
      chartData,
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

  return (
    <Container fluid py="xl" px="xl">
      <Group mb="lg" justify="space-between" align="center" mih={36}>
        <Title order={2}>Period</Title>
        <LinkButton
          variant="default"
          leftSection={<IconListDetails size={16} />}
          to="/$accountBookId/accounts"
          params={{ accountBookId }}
          search={{ tab: "ASSET", mode: "active" }}
        >
          Accounts
        </LinkButton>
      </Group>

      <Stack gap="lg">
        <Card withBorder radius="md" p="lg">
          <Stack gap="sm">
            <Group justify="space-between" align="center">
              <Text fw={600}>Period: {overview.selectedPeriodLabel}</Text>
              <Text c="dimmed" size="sm">
                Amounts shown in {overview.referenceCurrency}
              </Text>
            </Group>

            <Group align="end" gap="sm" className={classes.periodSelectorRow}>
              <NativeSelect
                label="Period"
                value={overview.selectedPeriodSpecifier}
                onChange={(event) => {
                  const value = event.currentTarget.value;

                  if (value === "month") {
                    const monthValue =
                      overview.selectedGranularity === "month"
                        ? formatMonthPeriodValue(
                            overview.selectedYear,
                            overview.selectedMonth ?? 0,
                          )
                        : overview.currentMonthValue;
                    onPeriodChange(monthValue);
                    return;
                  }

                  if (value === "year") {
                    const yearValue =
                      overview.selectedGranularity === "year"
                        ? String(overview.selectedYear)
                        : overview.currentYearValue;
                    onPeriodChange(yearValue);
                    return;
                  }

                  onPeriodChange(value);
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
                  overview.selectedPeriodSpecifier !== "month" &&
                  overview.selectedPeriodSpecifier !== "year"
                }
                value={String(overview.selectedYear)}
                onChange={(event) => {
                  const nextYear = Number(event.currentTarget.value);

                  if (overview.selectedPeriodSpecifier === "year") {
                    onPeriodChange(String(nextYear));
                    return;
                  }

                  const nextMonth = clampMonth({
                    year: nextYear,
                    month: selectedMonth,
                    minBookingDate,
                    maxDate,
                  });
                  onPeriodChange(formatMonthPeriodValue(nextYear, nextMonth));
                }}
                data={overview.availableYears.map((year) => ({
                  value: String(year),
                  label: String(year),
                }))}
              />

              {overview.selectedPeriodSpecifier === "month" ? (
                <NativeSelect
                  label="Month"
                  value={String(selectedMonth)}
                  onChange={(event) => {
                    const nextMonth = Number(event.currentTarget.value);
                    onPeriodChange(
                      formatMonthPeriodValue(overview.selectedYear, nextMonth),
                    );
                  }}
                  data={monthOptions}
                />
              ) : null}
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
              <Flex gap="xs" wrap="wrap" justify="flex-end">
                <SegmentedControl
                  size="xs"
                  aria-label="Breakdown chart type"
                  value={selectedChartType}
                  onChange={(value) =>
                    setSelectedChartType(value as BreakdownChartType)
                  }
                  data={[
                    {
                      label: (
                        <Group gap={0} wrap="nowrap">
                          <IconChartDonut size={14} />
                          <VisuallyHidden>Donut chart</VisuallyHidden>
                        </Group>
                      ),
                      value: "donut",
                    },
                    {
                      label: (
                        <Group gap={0} wrap="nowrap">
                          <IconChartBar size={14} />
                          <VisuallyHidden>Bar chart</VisuallyHidden>
                        </Group>
                      ),
                      value: "bar",
                    },
                  ]}
                />
                <SegmentedControl
                  size="xs"
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
