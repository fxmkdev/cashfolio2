import {
  Alert,
  Breadcrumbs,
  Button,
  Card,
  Center,
  Container,
  Flex,
  Group,
  NativeSelect,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  Title,
  UnstyledButton,
  useComputedColorScheme,
  useMantineTheme,
} from "@mantine/core";
import {
  IconAlertTriangle,
  IconArrowUp,
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
import { useCallback, useEffect, useMemo, useState } from "react";
import { ensureChartModulesRegistered } from "../../ag-chart-modules";
import { LinkButton } from "../../components/link-button";
import { TopPageHeader } from "../../components/top-page-header";
import type { getPeriodOverview } from "../../server/period";
import { formatMonthPeriodValue } from "../../shared/period";
import {
  clampBreakdownPath,
  getBreakdownDrillState,
  isBreakdownNodeDrillable,
} from "./-period-breakdown-drill";
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

type BreakdownDatum = {
  id: string;
  label: string;
  kind: "group" | "account";
  amount: number;
  percentage: number;
  isDrillable: boolean;
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
type BreakdownBarDatum = {
  id: string;
  kind: "group" | "account";
  isDrillable: boolean;
  label: string;
  amountLabel: string;
  percentageLabel: string;
} & Record<string, number | null | string | boolean>;

type BreakdownBarSeriesDefinition = {
  key: string;
  label: string;
};

function arePathsEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
}

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
  const [drillPathByBreakdown, setDrillPathByBreakdown] = useState<
    Record<BreakdownType, string[]>
  >({
    expense: [],
    income: [],
  });

  useEffect(() => {
    setDrillPathByBreakdown({
      expense: [],
      income: [],
    });
  }, [overview.selectedPeriodValue]);

  useEffect(() => {
    setDrillPathByBreakdown((previousPaths) => {
      const nextExpensePath = clampBreakdownPath({
        hierarchy: overview.expenseBreakdown.hierarchy,
        path: previousPaths.expense,
      });
      const nextIncomePath = clampBreakdownPath({
        hierarchy: overview.incomeBreakdown.hierarchy,
        path: previousPaths.income,
      });

      if (
        arePathsEqual(nextExpensePath, previousPaths.expense) &&
        arePathsEqual(nextIncomePath, previousPaths.income)
      ) {
        return previousPaths;
      }

      return {
        expense: nextExpensePath,
        income: nextIncomePath,
      };
    });
  }, [overview.expenseBreakdown.hierarchy, overview.incomeBreakdown.hierarchy]);

  const breakdownTitle =
    selectedBreakdown === "expense" ? "Expense Breakdown" : "Income Breakdown";
  const breakdownRootLabel =
    selectedBreakdown === "expense" ? "All Expenses" : "All Income";
  const drillState = useMemo(
    () =>
      getBreakdownDrillState({
        hierarchy: activeBreakdown.hierarchy,
        path: drillPathByBreakdown[selectedBreakdown],
        rootLabel: breakdownRootLabel,
      }),
    [
      activeBreakdown.hierarchy,
      breakdownRootLabel,
      drillPathByBreakdown,
      selectedBreakdown,
    ],
  );
  const breakdownSubtitle =
    drillState.clampedPath.length === 0
      ? selectedBreakdown === "expense"
        ? "Top-level expense groups for the selected period"
        : "Top-level income groups for the selected period"
      : `Inside ${drillState.breadcrumbs[drillState.breadcrumbs.length - 1]?.label}`;
  const emptyBreakdownMessage =
    selectedBreakdown === "expense"
      ? "No expense bookings were found for this period."
      : "No income bookings were found for this period.";
  const currentBreakdownLevelTotalAmount = useMemo(
    () =>
      drillState.currentNodes.reduce(
        (sum, breakdownNode) => sum + breakdownNode.amount,
        0,
      ),
    [drillState.currentNodes],
  );

  const chartData = useMemo<BreakdownDatum[]>(
    () =>
      drillState.currentNodes.map((item) => {
        const percentage =
          currentBreakdownLevelTotalAmount <= 0
            ? 0
            : (item.amount / currentBreakdownLevelTotalAmount) * 100;

        return {
          id: item.id,
          label: item.label,
          kind: item.kind,
          amount: item.amount,
          percentage,
          isDrillable: isBreakdownNodeDrillable(item),
          amountLabel: currencyFormatter.format(item.amount),
          percentageLabel: `${percentageFormatter.format(percentage)}%`,
        };
      }),
    [
      currentBreakdownLevelTotalAmount,
      currencyFormatter,
      drillState.currentNodes,
      percentageFormatter,
    ],
  );

  const totalBreakdownAmountLabel = useMemo(
    () => currencyFormatter.format(currentBreakdownLevelTotalAmount),
    [currentBreakdownLevelTotalAmount, currencyFormatter],
  );

  const hasBreakdown = chartData.length > 0;
  const updateSelectedBreakdownPath = useCallback(
    (nextPath: string[]) => {
      setDrillPathByBreakdown((previousPaths) => ({
        ...previousPaths,
        [selectedBreakdown]: nextPath,
      }));
    },
    [selectedBreakdown],
  );
  const handleNodeDoubleClick = useCallback(
    (datum: BreakdownDatum | BreakdownBarDatum) => {
      if (
        datum.kind !== "group" ||
        !datum.isDrillable ||
        drillState.clampedPath.includes(datum.id)
      ) {
        return;
      }

      updateSelectedBreakdownPath([...drillState.clampedPath, datum.id]);
    },
    [drillState.clampedPath, updateSelectedBreakdownPath],
  );
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
          id: item.id,
          kind: item.kind,
          isDrillable: item.isDrillable,
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
            const data = [
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
            ];

            if (item.isDrillable) {
              data.push({
                label: "Action",
                value: "Double-click to drill down",
              });
            }

            return {
              heading: item.label,
              data,
            };
          },
        },
        listeners: {
          seriesNodeDoubleClick: ({ datum }) => {
            handleNodeDoubleClick(datum as BreakdownDatum);
          },
        },
      },
    ],
    [colors.chartTextColor, handleNodeDoubleClick, totalBreakdownAmountLabel],
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
            const data = [
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
            ];

            if (item.isDrillable) {
              data.push({
                label: "Action",
                value: "Double-click to drill down",
              });
            }

            return {
              heading: item.label,
              data,
            };
          },
        },
        listeners: {
          seriesNodeDoubleClick: ({ datum }) => {
            handleNodeDoubleClick(datum as BreakdownBarDatum);
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
      handleNodeDoubleClick,
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
            <Group
              justify="space-between"
              align="center"
              gap="xs"
              className={classes.breakdownContextRow}
            >
              <Group gap="xs" wrap="wrap">
                <Button
                  variant="default"
                  size="compact-sm"
                  leftSection={<IconArrowUp size={14} />}
                  disabled={drillState.clampedPath.length === 0}
                  onClick={() => {
                    updateSelectedBreakdownPath(
                      drillState.clampedPath.slice(
                        0,
                        drillState.clampedPath.length - 1,
                      ),
                    );
                  }}
                >
                  Up
                </Button>

                <Breadcrumbs>
                  {drillState.breadcrumbs.map((breadcrumb, breadcrumbIndex) => {
                    const isCurrent =
                      breadcrumbIndex === drillState.breadcrumbs.length - 1;
                    const nextPath =
                      breadcrumb.id == null
                        ? []
                        : drillState.clampedPath.slice(0, breadcrumbIndex);

                    if (isCurrent) {
                      return (
                        <Text
                          key={breadcrumb.id ?? "root"}
                          fw={600}
                          fz="sm"
                          lh="inherit"
                        >
                          {breadcrumb.label}
                        </Text>
                      );
                    }

                    return (
                      <UnstyledButton
                        key={breadcrumb.id ?? "root"}
                        className={classes.breadcrumbButton}
                        onClick={() => {
                          updateSelectedBreakdownPath(nextPath);
                        }}
                      >
                        <Text fz="sm" c="blue.7" lh="inherit">
                          {breadcrumb.label}
                        </Text>
                      </UnstyledButton>
                    );
                  })}
                </Breadcrumbs>
              </Group>

              <Text c="dimmed" size="xs">
                Double-click a group to drill down.
              </Text>
            </Group>

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
