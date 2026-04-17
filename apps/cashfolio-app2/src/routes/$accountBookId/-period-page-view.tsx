import {
  Card,
  Container,
  SimpleGrid,
  Stack,
  Text,
  Title,
  useComputedColorScheme,
  useMantineTheme,
} from "@mantine/core";
import { IconListDetails } from "@tabler/icons-react";
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
import {
  BreakdownChartType,
  BreakdownType,
  PeriodBreakdownCard,
} from "./-period-breakdown-card";
import classes from "./-period-page-view.module.css";
import {
  buildPeriodSelectorModel,
  getMonthPickerValue,
  getPeriodModeChangeValue,
  getPeriodStepValue,
  getYearPickerValue,
} from "./-period-selector-model";
import { PeriodSelectorCard } from "./-period-selector-card";

ensureChartModulesRegistered();

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

type BreakdownBarDatum = {
  label: string;
  amountLabel: string;
  percentageLabel: string;
} & Record<string, number | null | string>;

type BreakdownBarSeriesDefinition = {
  key: string;
  label: string;
};

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
  const periodSelectorModel = useMemo(
    () =>
      buildPeriodSelectorModel({
        selectedGranularity: overview.selectedGranularity,
        selectedYear: overview.selectedYear,
        selectedMonth: overview.selectedMonth,
        minBookingDate,
        maxDate,
      }),
    [
      maxDate,
      minBookingDate,
      overview.selectedGranularity,
      overview.selectedMonth,
      overview.selectedYear,
    ],
  );
  const periodMode = periodSelectorModel.periodMode;

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
    setPickerOpened(false);
    const nextPeriodValue = getPeriodModeChangeValue({
      nextMode,
      periodMode,
      selectedYear: overview.selectedYear,
      selectedYearMaxMonth:
        periodSelectorModel.selectedYearMonthBounds.maxMonth,
    });
    if (!nextPeriodValue) {
      return;
    }
    onPeriodChange(nextPeriodValue);
  };

  const handlePeriodStep = (step: -1 | 1) => {
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
    if (!nextPeriodValue) {
      return;
    }
    onPeriodChange(nextPeriodValue);
  };

  const handleMonthPickerChange = (nextValue: string | null) => {
    const nextPeriodValue = getMonthPickerValue(nextValue);
    if (!nextPeriodValue) {
      return;
    }
    onPeriodChange(nextPeriodValue);
    setPickerOpened(false);
  };

  const handleYearPickerChange = (nextValue: string | null) => {
    const nextPeriodValue = getYearPickerValue(nextValue);
    if (!nextPeriodValue) {
      return;
    }
    onPeriodChange(nextPeriodValue);
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
        <div
          className={classes.periodTopSection}
          data-testid="period-top-section"
        >
          <PeriodSelectorCard
            selectedPeriodLabel={overview.selectedPeriodLabel}
            referenceCurrency={overview.referenceCurrency}
            periodMode={periodMode}
            pickerOpened={pickerOpened}
            onPickerOpenedChange={setPickerOpened}
            canGoToPreviousPeriod={periodSelectorModel.canGoToPreviousPeriod}
            canGoToNextPeriod={periodSelectorModel.canGoToNextPeriod}
            onPeriodModeChange={handlePeriodModeChange}
            onPeriodStep={handlePeriodStep}
            selectedMonthValue={formatMonthPeriodValue(
              overview.selectedYear,
              periodSelectorModel.selectedMonth,
            )}
            selectedYearValue={`${String(overview.selectedYear).padStart(4, "0")}-01-01`}
            minMonthPickerDate={periodSelectorModel.minMonthPickerDate}
            maxMonthPickerDate={periodSelectorModel.maxMonthPickerDate}
            minYearPickerDate={periodSelectorModel.minYearPickerDate}
            maxYearPickerDate={periodSelectorModel.maxYearPickerDate}
            onMonthPickerChange={handleMonthPickerChange}
            onYearPickerChange={handleYearPickerChange}
          />
        </div>

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
          onSelectedBreakdownChange={setSelectedBreakdown}
          selectedChartType={selectedChartType}
          onSelectedChartTypeChange={setSelectedChartType}
          breakdownTitle={breakdownTitle}
          breakdownSubtitle={breakdownSubtitle}
          emptyBreakdownMessage={emptyBreakdownMessage}
          hasBreakdown={hasBreakdown}
          chartOptions={chartOptions}
          skippedBookingsCount={overview.skippedBookingsCount}
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
