import {
  Alert,
  Card,
  Container,
  Group,
  SimpleGrid,
  Stack,
  Text,
  Title,
  useComputedColorScheme,
  useMantineTheme,
} from "@mantine/core";
import { IconAlertTriangle, IconListDetails } from "@tabler/icons-react";
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
import { PeriodBreakdownCard } from "./-period-breakdown-card";
import {
  type PeriodBreakdownChartDatum,
  type PeriodBreakdownNodeDatum,
  usePeriodBreakdownChartOptions,
} from "./-period-breakdown-chart-options";
import {
  type BreakdownChartType,
  type BreakdownType,
} from "./-period-breakdown-types";
import { PeriodSelectorRow } from "./-period-selector-row";
import { getDashboardChartThemeColors } from "./-dashboard-chart-theme";

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
  drillPathByBreakdown: Record<BreakdownType, string[]>;
  onPeriodChange: (nextPeriodValue: string) => void;
  onDrillPathByBreakdownChange: (
    nextPathByBreakdown: Record<BreakdownType, string[]>,
  ) => void;
};

type StatCardProps = {
  label: string;
  value: string;
  valueColor: "green" | "red";
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
  drillPathByBreakdown,
  onPeriodChange,
  onDrillPathByBreakdownChange,
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

  useEffect(() => {
    const nextExpensePath = clampBreakdownPath({
      hierarchy: overview.expenseBreakdown.hierarchy,
      path: drillPathByBreakdown.expense,
    });
    const nextIncomePath = clampBreakdownPath({
      hierarchy: overview.incomeBreakdown.hierarchy,
      path: drillPathByBreakdown.income,
    });

    if (
      arePathsEqual(nextExpensePath, drillPathByBreakdown.expense) &&
      arePathsEqual(nextIncomePath, drillPathByBreakdown.income)
    ) {
      return;
    }

    onDrillPathByBreakdownChange({
      expense: nextExpensePath,
      income: nextIncomePath,
    });
  }, [
    drillPathByBreakdown.expense,
    drillPathByBreakdown.income,
    onDrillPathByBreakdownChange,
    overview.expenseBreakdown.hierarchy,
    overview.incomeBreakdown.hierarchy,
  ]);

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

  const chartData = useMemo<PeriodBreakdownChartDatum[]>(
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
  const currentBreakdownNodeId =
    drillState.currentPathNodes[drillState.currentPathNodes.length - 1]?.id ??
    null;
  const hasBreakdownAmountDiscrepancy = useMemo(() => {
    if (currentBreakdownNodeId == null) {
      return activeBreakdown.hasHiddenAmountDiscrepancy;
    }

    return activeBreakdown.hiddenAmountDiscrepancyNodeIds.includes(
      currentBreakdownNodeId,
    );
  }, [
    activeBreakdown.hasHiddenAmountDiscrepancy,
    activeBreakdown.hiddenAmountDiscrepancyNodeIds,
    currentBreakdownNodeId,
  ]);
  const updateSelectedBreakdownPath = useCallback(
    (nextPath: string[]) => {
      onDrillPathByBreakdownChange({
        ...drillPathByBreakdown,
        [selectedBreakdown]: nextPath,
      });
    },
    [drillPathByBreakdown, onDrillPathByBreakdownChange, selectedBreakdown],
  );
  const handleNodeDoubleClick = useCallback(
    (datum: PeriodBreakdownNodeDatum) => {
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
  const chartOptions = usePeriodBreakdownChartOptions({
    chartData,
    selectedChartType,
    colors,
    totalBreakdownAmountLabel,
    onNodeDoubleClick: handleNodeDoubleClick,
  });
  const handlePeriodSpecifierChange = useCallback(
    (value: string) => {
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
    },
    [
      onPeriodChange,
      overview.currentMonthValue,
      overview.currentYearValue,
      overview.selectedGranularity,
      overview.selectedMonth,
      overview.selectedYear,
    ],
  );
  const handleYearChange = useCallback(
    (nextYear: number) => {
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
    },
    [
      maxDate,
      minBookingDate,
      onPeriodChange,
      overview.selectedPeriodSpecifier,
      selectedMonth,
    ],
  );
  const handleMonthChange = useCallback(
    (nextMonth: number) => {
      onPeriodChange(formatMonthPeriodValue(overview.selectedYear, nextMonth));
    },
    [onPeriodChange, overview.selectedYear],
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

            <PeriodSelectorRow
              selectedPeriodSpecifier={overview.selectedPeriodSpecifier}
              selectedYear={overview.selectedYear}
              selectedMonth={selectedMonth}
              monthOptions={monthOptions}
              availableYears={overview.availableYears}
              onPeriodSpecifierChange={handlePeriodSpecifierChange}
              onYearChange={handleYearChange}
              onMonthChange={handleMonthChange}
            />
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

        <PeriodBreakdownCard
          selectedBreakdown={selectedBreakdown}
          selectedChartType={selectedChartType}
          breakdownTitle={breakdownTitle}
          breadcrumbs={drillState.breadcrumbs}
          clampedPath={drillState.clampedPath}
          hasBreakdownAmountDiscrepancy={hasBreakdownAmountDiscrepancy}
          hasBreakdown={hasBreakdown}
          emptyBreakdownMessage={emptyBreakdownMessage}
          chartOptions={chartOptions}
          onSelectedBreakdownChange={setSelectedBreakdown}
          onSelectedChartTypeChange={setSelectedChartType}
          onDrillPathChange={updateSelectedBreakdownPath}
          footer={
            overview.skippedBookingsCount > 0 ? (
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
            ) : null
          }
        />
      </Stack>

      {selectedPeriodValue !== overview.selectedPeriodValue ? (
        <Text c="dimmed" mt="sm" size="xs">
          Showing nearest supported period for the requested value.
        </Text>
      ) : null}
    </Container>
  );
}
