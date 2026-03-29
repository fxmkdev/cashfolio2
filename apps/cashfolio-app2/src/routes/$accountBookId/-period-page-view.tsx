import {
  Alert,
  Card,
  Container,
  Group,
  NativeSelect,
  SimpleGrid,
  Stack,
  Text,
  Title,
  useComputedColorScheme,
  useMantineTheme,
} from "@mantine/core";
import { IconAlertTriangle, IconListDetails } from "@tabler/icons-react";
import { AgCharts } from "ag-charts-react";
import type {
  AgDonutSeriesOptions,
  AgPolarChartOptions,
} from "ag-charts-community";
import { useMemo } from "react";
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

type ExpenseBreakdownDatum =
  PeriodOverview["expenseBreakdown"]["items"][number] & {
    amountLabel: string;
    percentageLabel: string;
  };

type StatCardProps = {
  label: string;
  value: string;
  valueColor: "green" | "red";
};

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

  const chartData = useMemo<ExpenseBreakdownDatum[]>(
    () =>
      overview.expenseBreakdown.items.map((item) => ({
        ...item,
        amountLabel: currencyFormatter.format(item.amount),
        percentageLabel: `${percentageFormatter.format(item.percentage)}%`,
      })),
    [currencyFormatter, overview.expenseBreakdown.items, percentageFormatter],
  );

  const totalExpenseAmountLabel = useMemo(
    () => currencyFormatter.format(overview.expenseBreakdown.totalAmount),
    [currencyFormatter, overview.expenseBreakdown.totalAmount],
  );

  const hasExpenseBreakdown = chartData.length > 0;

  const donutSeries = useMemo<AgDonutSeriesOptions<ExpenseBreakdownDatum>[]>(
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
            text: totalExpenseAmountLabel,
            color: colors.chartTextColor,
            fontWeight: 600,
            fontSize: 18,
          },
        ],
        tooltip: {
          renderer: ({ datum }) => {
            const item = datum as ExpenseBreakdownDatum;

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
                  value: totalExpenseAmountLabel,
                },
              ],
            };
          },
        },
      },
    ],
    [colors.chartTextColor, totalExpenseAmountLabel],
  );

  const chartOptions = useMemo<AgPolarChartOptions<ExpenseBreakdownDatum>>(
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
            <Title order={4}>Expense Breakdown</Title>
            <Text c="dimmed" size="sm">
              Top-level expense groups for the selected period
            </Text>

            {hasExpenseBreakdown ? (
              <div className={classes.chartContainer}>
                <AgCharts options={chartOptions} />
              </div>
            ) : (
              <Text c="dimmed" mt="md">
                No expense bookings were found for this period.
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
