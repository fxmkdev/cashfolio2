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
import type {
  AgCartesianChartOptions,
  AgWaterfallSeriesItemStylerParams,
  AgWaterfallSeriesOptions,
} from "ag-charts-community";
import { AgCharts } from "ag-charts-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ensureChartModulesRegistered } from "@/ag-chart-modules";
import { LinkButton } from "@/components/link-button";
import { TopPageHeader } from "@/components/top-page-header";
import type { getPeriodOverview } from "@/server/period";
import { getDashboardChartThemeColors } from "@/shared/dashboard-chart-theme";
import { formatMonthPeriodValue } from "@/shared/period";
import { PeriodAllocationBreakdownCard } from "./-allocation-breakdown-card";
import { PeriodBreakdownCard } from "./-breakdown-card";
import {
  clampBreakdownPath,
  getBreakdownDrillState,
  isBreakdownNodeDrillable,
  parseBreakdownAccountId,
} from "./-breakdown-drill";
import {
  type PeriodBreakdownChartDatum,
  type PeriodBreakdownNodeDatum,
  usePeriodBreakdownChartOptions,
} from "./-breakdown-chart-options";
import {
  type AllocationBreakdownType,
  type BreakdownChartType,
  type BreakdownType,
} from "./-breakdown-types";
import classes from "./-page-view.module.css";
import {
  buildPeriodSelectorModel,
  getMonthPickerValue,
  getPeriodModeChangeValue,
  getPeriodStepValue,
  getYearPickerValue,
} from "./-selector-model";
import { PeriodSelectorCard } from "./-selector-card";

ensureChartModulesRegistered();

type PeriodOverview = Awaited<ReturnType<typeof getPeriodOverview>>;

export type PeriodPageViewProps = {
  accountBookId: string;
  overview: PeriodOverview;
  selectedPeriodValue: string;
  drillPathByBreakdown: Record<BreakdownType, string[]>;
  drillPathByAllocationBreakdown: Record<AllocationBreakdownType, string[]>;
  onPeriodChange: (nextPeriodValue: string) => void;
  onDrillPathByBreakdownChange: (
    nextPathByBreakdown: Record<BreakdownType, string[]>,
  ) => void;
  onBreakdownAccountDoubleClick: (accountId: string) => void;
  onDrillPathByAllocationBreakdownChange: (
    nextPathByBreakdown: Record<AllocationBreakdownType, string[]>,
  ) => void;
};

type StatCardProps = {
  label: string;
  value: string;
  valueColor: "green" | "red";
  secondaryValue?: string;
  testId?: string;
};

type StatCardData = StatCardProps & {
  id: string;
};

type WaterfallDatum = {
  label: string;
  amount: number;
};

type WaterfallTotalDatum = {
  isTotal: boolean;
};

function isWaterfallTotalDatum(datum: unknown): datum is WaterfallTotalDatum {
  if (typeof datum !== "object" || datum === null || !("isTotal" in datum)) {
    return false;
  }

  return typeof datum.isTotal === "boolean";
}

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

function getAllocationPartialDataNotes(args: {
  skippedMissingReferenceBalanceCount: number;
  skippedNonPositiveCount: number;
}) {
  return [
    args.skippedMissingReferenceBalanceCount > 0
      ? `${args.skippedMissingReferenceBalanceCount} account(s) were skipped because reference-currency balances were unavailable.`
      : null,
    args.skippedNonPositiveCount > 0
      ? `${args.skippedNonPositiveCount} account(s) with non-positive balances were excluded from allocation.`
      : null,
  ]
    .filter((value): value is string => value != null)
    .join(" ");
}

function StatCard({
  label,
  value,
  valueColor,
  secondaryValue,
  testId,
}: StatCardProps) {
  return (
    <Card withBorder radius="md" p="lg" data-testid={testId}>
      <Stack gap={4} align="center">
        <Text c="dimmed" fw={600} ta="center">
          {label}
        </Text>
        <Text fw={700} fz="xl" c={valueColor}>
          {value}
        </Text>
        {secondaryValue ? (
          <Text c="dimmed" fw={500} fz="sm" ta="center">
            {secondaryValue}
          </Text>
        ) : null}
      </Stack>
    </Card>
  );
}

export function PeriodPageView({
  accountBookId,
  overview,
  selectedPeriodValue,
  drillPathByBreakdown,
  drillPathByAllocationBreakdown,
  onPeriodChange,
  onDrillPathByBreakdownChange,
  onBreakdownAccountDoubleClick,
  onDrillPathByAllocationBreakdownChange,
}: PeriodPageViewProps) {
  const [selectedBreakdown, setSelectedBreakdown] =
    useState<BreakdownType>("expense");
  const [selectedAllocationBreakdown, setSelectedAllocationBreakdown] =
    useState<AllocationBreakdownType>("asset");
  const [selectedChartType, setSelectedChartType] =
    useState<BreakdownChartType>("donut");
  const [pickerOpened, setPickerOpened] = useState(false);
  const theme = useMantineTheme();
  const isDarkMode = useComputedColorScheme() === "dark";
  const colors = useMemo(
    () => getDashboardChartThemeColors({ theme, isDarkMode }),
    [theme, isDarkMode],
  );
  const waterfallPalette = useMemo(
    () => ({
      positive: isDarkMode ? theme.colors.green[5] : theme.colors.green[6],
      negative: isDarkMode ? theme.colors.red[5] : theme.colors.red[6],
      total: isDarkMode ? theme.colors.blue[4] : theme.colors.blue[6],
    }),
    [isDarkMode, theme],
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
  const savingsRateFormatter = useMemo(
    () =>
      new Intl.NumberFormat("en-CH", {
        style: "percent",
        minimumFractionDigits: 0,
        maximumFractionDigits: 1,
      }),
    [],
  );

  const periodSelectorModel = useMemo(
    () =>
      buildPeriodSelectorModel({
        selectedGranularity: overview.selectedGranularity,
        selectedYear: overview.selectedYear,
        selectedMonth: overview.selectedMonth,
        minBookingDate: overview.minBookingDate
          ? new Date(overview.minBookingDate)
          : null,
        maxDate: new Date(overview.maxDate),
      }),
    [
      overview.maxDate,
      overview.minBookingDate,
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
  const activeAllocationBreakdown = useMemo(
    () =>
      selectedAllocationBreakdown === "asset"
        ? overview.assetBreakdown
        : overview.liabilityBreakdown,
    [
      overview.assetBreakdown,
      overview.liabilityBreakdown,
      selectedAllocationBreakdown,
    ],
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
  useEffect(() => {
    const nextAssetPath = clampBreakdownPath({
      hierarchy: overview.assetBreakdown.hierarchy,
      path: drillPathByAllocationBreakdown.asset,
    });
    const nextLiabilityPath = clampBreakdownPath({
      hierarchy: overview.liabilityBreakdown.hierarchy,
      path: drillPathByAllocationBreakdown.liability,
    });

    if (
      arePathsEqual(nextAssetPath, drillPathByAllocationBreakdown.asset) &&
      arePathsEqual(nextLiabilityPath, drillPathByAllocationBreakdown.liability)
    ) {
      return;
    }

    onDrillPathByAllocationBreakdownChange({
      asset: nextAssetPath,
      liability: nextLiabilityPath,
    });
  }, [
    drillPathByAllocationBreakdown.asset,
    drillPathByAllocationBreakdown.liability,
    onDrillPathByAllocationBreakdownChange,
    overview.assetBreakdown.hierarchy,
    overview.liabilityBreakdown.hierarchy,
  ]);

  const breakdownTitle =
    selectedBreakdown === "expense" ? "Expenses Breakdown" : "Income Breakdown";
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
      ? "No expenses were found for this period."
      : "No income was found for this period.";
  const breakdownSubtitle = useMemo(() => {
    const isTopLevel = drillState.clampedPath.length === 0;

    if (isTopLevel) {
      return selectedBreakdown === "expense"
        ? "Top-level groups for expenses in the selected period"
        : "Top-level groups for income in the selected period";
    }

    return selectedBreakdown === "expense"
      ? "Drilled expense groups in the selected period"
      : "Drilled income groups in the selected period";
  }, [drillState.clampedPath.length, selectedBreakdown]);
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
      if (datum.kind === "group") {
        if (!datum.isDrillable || drillState.clampedPath.includes(datum.id)) {
          return;
        }

        updateSelectedBreakdownPath([...drillState.clampedPath, datum.id]);
        return;
      }

      const accountId = parseBreakdownAccountId(datum.id);
      if (!accountId) {
        return;
      }

      onBreakdownAccountDoubleClick(accountId);
    },
    [
      drillState.clampedPath,
      onBreakdownAccountDoubleClick,
      updateSelectedBreakdownPath,
    ],
  );
  const chartOptions = usePeriodBreakdownChartOptions({
    chartData,
    selectedChartType,
    colors,
    totalBreakdownAmountLabel,
    onNodeDoubleClick: handleNodeDoubleClick,
  });
  const handleChartContainerDoubleClick = useMemo(() => {
    if (chartData.length !== 1) {
      return null;
    }

    return () => {
      const onlyNode = chartData[0];
      if (onlyNode) {
        handleNodeDoubleClick(onlyNode);
      }
    };
  }, [chartData, handleNodeDoubleClick]);

  const allocationBreakdownTitle =
    selectedAllocationBreakdown === "asset"
      ? "Assets Allocation"
      : "Liabilities Allocation";
  const allocationBreakdownRootLabel =
    selectedAllocationBreakdown === "asset" ? "All Assets" : "All Liabilities";
  const allocationDrillState = useMemo(
    () =>
      getBreakdownDrillState({
        hierarchy: activeAllocationBreakdown.hierarchy,
        path: drillPathByAllocationBreakdown[selectedAllocationBreakdown],
        rootLabel: allocationBreakdownRootLabel,
      }),
    [
      activeAllocationBreakdown.hierarchy,
      allocationBreakdownRootLabel,
      drillPathByAllocationBreakdown,
      selectedAllocationBreakdown,
    ],
  );
  const allocationBreakdownSubtitle = useMemo(() => {
    const isTopLevel = allocationDrillState.clampedPath.length === 0;
    const groupLevelLabel =
      selectedAllocationBreakdown === "asset"
        ? "asset groups"
        : "liability groups";

    return isTopLevel
      ? `Top-level ${groupLevelLabel} as of period end`
      : `Drilled ${groupLevelLabel} as of period end`;
  }, [allocationDrillState.clampedPath.length, selectedAllocationBreakdown]);
  const emptyAllocationBreakdownMessage =
    selectedAllocationBreakdown === "asset"
      ? "No positive, convertible asset balances were found as of period end."
      : "No positive, convertible liability balances were found as of period end.";
  const currentAllocationLevelTotalAmount = useMemo(
    () =>
      allocationDrillState.currentNodes.reduce(
        (sum, breakdownNode) => sum + breakdownNode.amount,
        0,
      ),
    [allocationDrillState.currentNodes],
  );
  const allocationChartData = useMemo<PeriodBreakdownChartDatum[]>(
    () =>
      allocationDrillState.currentNodes.map((item) => {
        const percentage =
          currentAllocationLevelTotalAmount <= 0
            ? 0
            : (item.amount / currentAllocationLevelTotalAmount) * 100;

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
      allocationDrillState.currentNodes,
      currencyFormatter,
      currentAllocationLevelTotalAmount,
      percentageFormatter,
    ],
  );
  const totalAllocationAmountLabel = useMemo(
    () => currencyFormatter.format(currentAllocationLevelTotalAmount),
    [currentAllocationLevelTotalAmount, currencyFormatter],
  );
  const hasAllocationBreakdown = allocationChartData.length > 0;
  const currentAllocationBreakdownNodeId =
    allocationDrillState.currentPathNodes[
      allocationDrillState.currentPathNodes.length - 1
    ]?.id ?? null;
  const hasAllocationBreakdownAmountDiscrepancy = useMemo(() => {
    if (currentAllocationBreakdownNodeId == null) {
      return activeAllocationBreakdown.hasHiddenAmountDiscrepancy;
    }

    return activeAllocationBreakdown.hiddenAmountDiscrepancyNodeIds.includes(
      currentAllocationBreakdownNodeId,
    );
  }, [
    activeAllocationBreakdown.hasHiddenAmountDiscrepancy,
    activeAllocationBreakdown.hiddenAmountDiscrepancyNodeIds,
    currentAllocationBreakdownNodeId,
  ]);
  const updateSelectedAllocationBreakdownPath = useCallback(
    (nextPath: string[]) => {
      onDrillPathByAllocationBreakdownChange({
        ...drillPathByAllocationBreakdown,
        [selectedAllocationBreakdown]: nextPath,
      });
    },
    [
      drillPathByAllocationBreakdown,
      onDrillPathByAllocationBreakdownChange,
      selectedAllocationBreakdown,
    ],
  );
  const handleAllocationNodeDoubleClick = useCallback(
    (datum: PeriodBreakdownNodeDatum) => {
      if (
        datum.kind !== "group" ||
        !datum.isDrillable ||
        allocationDrillState.clampedPath.includes(datum.id)
      ) {
        return;
      }

      updateSelectedAllocationBreakdownPath([
        ...allocationDrillState.clampedPath,
        datum.id,
      ]);
    },
    [allocationDrillState.clampedPath, updateSelectedAllocationBreakdownPath],
  );
  const allocationChartOptions = usePeriodBreakdownChartOptions({
    chartData: allocationChartData,
    selectedChartType: "donut",
    colors,
    totalBreakdownAmountLabel: totalAllocationAmountLabel,
    onNodeDoubleClick: handleAllocationNodeDoubleClick,
  });
  const hasAllocationPartialData =
    activeAllocationBreakdown.skippedMissingReferenceBalanceCount > 0 ||
    activeAllocationBreakdown.skippedNonPositiveCount > 0;
  const allocationPartialDataNotes = getAllocationPartialDataNotes({
    skippedMissingReferenceBalanceCount:
      activeAllocationBreakdown.skippedMissingReferenceBalanceCount,
    skippedNonPositiveCount: activeAllocationBreakdown.skippedNonPositiveCount,
  });

  const amountCompactFormatter = useMemo(
    () =>
      new Intl.NumberFormat("en-CH", {
        notation: "compact",
        maximumFractionDigits: 1,
      }),
    [],
  );
  const gainsLossesLabel = overview.stats.gainsLosses >= 0 ? "Gains" : "Losses";
  const savingsRateLabel = useMemo(() => {
    if (overview.stats.income === 0) {
      return "—";
    }

    const savingsRateRatio = overview.stats.savings / overview.stats.income;
    return savingsRateFormatter.format(savingsRateRatio);
  }, [overview.stats.income, overview.stats.savings, savingsRateFormatter]);
  const waterfallData = useMemo<WaterfallDatum[]>(
    () => [
      {
        label: "Income",
        amount: overview.stats.income,
      },
      {
        label: "Expenses",
        amount: -overview.stats.expenses,
      },
      {
        label: gainsLossesLabel,
        amount: overview.stats.gainsLosses,
      },
    ],
    [
      gainsLossesLabel,
      overview.stats.expenses,
      overview.stats.gainsLosses,
      overview.stats.income,
    ],
  );
  const waterfallAmountByLabel = useMemo<Record<string, number>>(() => {
    const [incomeDatum, expensesDatum, gainsLossesDatum] = waterfallData;
    const savingsAmount = incomeDatum.amount + expensesDatum.amount;
    const totalReturnAmount = savingsAmount + gainsLossesDatum.amount;

    return {
      [incomeDatum.label]: incomeDatum.amount,
      [expensesDatum.label]: expensesDatum.amount,
      [gainsLossesDatum.label]: gainsLossesDatum.amount,
      Savings: savingsAmount,
      "Total Return": totalReturnAmount,
    };
  }, [waterfallData]);
  const waterfallSeries = useMemo<AgWaterfallSeriesOptions<WaterfallDatum>>(
    () => ({
      type: "waterfall",
      xKey: "label",
      yKey: "amount",
      yName: "Amount",
      widthRatio: 0.72,
      totals: [
        {
          totalType: "subtotal",
          index: 1,
          axisLabel: "Savings",
        },
        {
          totalType: "total",
          index: 2,
          axisLabel: "Total Return",
        },
      ],
      item: {
        positive: {
          fill: waterfallPalette.positive,
          stroke: waterfallPalette.positive,
        },
        negative: {
          fill: waterfallPalette.negative,
          stroke: waterfallPalette.negative,
        },
      },
      subtotal: {
        fill: waterfallPalette.total,
        stroke: waterfallPalette.total,
      },
      total: {
        fill: waterfallPalette.total,
        stroke: waterfallPalette.total,
      },
      itemStyler: (
        params: AgWaterfallSeriesItemStylerParams<WaterfallDatum>,
      ) => {
        if (isWaterfallTotalDatum(params.datum) && params.datum.isTotal) {
          return {
            fill: waterfallPalette.total,
            stroke: waterfallPalette.total,
          };
        }

        return undefined;
      },
      tooltip: {
        renderer: ({ datum }) => {
          const label = String(datum.label);
          const amount = waterfallAmountByLabel[label] ?? 0;

          return {
            heading: label,
            data: [
              {
                label: "Total",
                value: currencyFormatter.format(amount),
              },
            ],
          };
        },
      },
    }),
    [currencyFormatter, waterfallAmountByLabel, waterfallPalette],
  );
  const waterfallChartOptions = useMemo<AgCartesianChartOptions>(
    () => ({
      data: waterfallData,
      height: 360,
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
      series: [waterfallSeries],
      axes: {
        x: {
          type: "category",
        },
        y: {
          type: "number",
          label: {
            formatter: ({ value }) =>
              amountCompactFormatter.format(Number(value)),
          },
          crossLines: [
            {
              type: "line",
              value: 0,
              stroke: colors.zeroLineColor,
              strokeWidth: 1,
              lineDash: [5, 5],
            },
          ],
        },
      },
    }),
    [amountCompactFormatter, colors, waterfallData, waterfallSeries],
  );

  const statCards: StatCardData[] = [
    {
      id: "totalReturn",
      label: "Total Return",
      value: currencyFormatter.format(overview.stats.totalReturn),
      valueColor: overview.stats.totalReturn >= 0 ? "green" : "red",
    },
    {
      id: "savings",
      label: "Savings",
      value: currencyFormatter.format(overview.stats.savings),
      valueColor: overview.stats.savings >= 0 ? "green" : "red",
      secondaryValue: savingsRateLabel,
    },
    {
      id: "income",
      label: "Income",
      value: currencyFormatter.format(overview.stats.income),
      valueColor: "green" as const,
    },
    {
      id: "expenses",
      label: "Expenses",
      value: currencyFormatter.format(overview.stats.expenses),
      valueColor: "red" as const,
    },
    {
      id: "gainsLosses",
      label: gainsLossesLabel,
      value: currencyFormatter.format(overview.stats.gainsLosses),
      valueColor: overview.stats.gainsLosses >= 0 ? "green" : "red",
    },
  ];
  const endOfPeriodStatCards: StatCardData[] = [
    {
      id: "endOfPeriodNetWorth",
      label: "Net Worth",
      value: currencyFormatter.format(overview.stats.endOfPeriodNetWorth),
      valueColor: overview.stats.endOfPeriodNetWorth >= 0 ? "green" : "red",
    },
    {
      id: "endOfPeriodAssets",
      label: "Assets",
      value: currencyFormatter.format(overview.stats.endOfPeriodAssets),
      valueColor: overview.stats.endOfPeriodAssets >= 0 ? "green" : "red",
    },
    {
      id: "endOfPeriodLiabilities",
      label: "Liabilities",
      value: currencyFormatter.format(overview.stats.endOfPeriodLiabilities),
      valueColor: overview.stats.endOfPeriodLiabilities > 0 ? "red" : "green",
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
            selectedMonthValue={
              formatMonthPeriodValue(
                overview.selectedYear,
                periodSelectorModel.selectedMonth,
              ) + "-01"
            }
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
              key={card.id}
              label={card.label}
              value={card.value}
              valueColor={card.valueColor}
              secondaryValue={card.secondaryValue}
              testId={`period-stat-card-${card.id}`}
            />
          ))}
        </SimpleGrid>
        <Stack gap="xs">
          <Text c="dimmed" size="sm" ta="center">
            As of period end (last day)
          </Text>
          <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="lg">
            {endOfPeriodStatCards.map((card) => (
              <StatCard
                key={card.id}
                label={card.label}
                value={card.value}
                valueColor={card.valueColor}
              />
            ))}
          </SimpleGrid>
        </Stack>

        <SimpleGrid
          cols={{ base: 1, lg: 2, xl: 3 }}
          spacing="lg"
          data-testid="period-analysis-section"
        >
          <Card withBorder radius="md" p="md">
            <Stack gap="sm">
              <Title order={4}>Contribution to Total Return</Title>
              <Text c="dimmed" size="sm">
                How Income, Expenses, and {gainsLossesLabel} lead to Total
                Return
              </Text>
              <div className={classes.chartContainer}>
                <AgCharts options={waterfallChartOptions} />
              </div>
            </Stack>
          </Card>

          <PeriodBreakdownCard
            selectedBreakdown={selectedBreakdown}
            selectedChartType={selectedChartType}
            breakdownTitle={breakdownTitle}
            breakdownSubtitle={breakdownSubtitle}
            breadcrumbs={drillState.breadcrumbs}
            clampedPath={drillState.clampedPath}
            hasBreakdownAmountDiscrepancy={hasBreakdownAmountDiscrepancy}
            hasBreakdown={hasBreakdown}
            emptyBreakdownMessage={emptyBreakdownMessage}
            chartOptions={chartOptions}
            onSelectedBreakdownChange={setSelectedBreakdown}
            onSelectedChartTypeChange={setSelectedChartType}
            onDrillPathChange={updateSelectedBreakdownPath}
            onChartContainerDoubleClick={handleChartContainerDoubleClick}
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

          <PeriodAllocationBreakdownCard
            selectedBreakdown={selectedAllocationBreakdown}
            breakdownTitle={allocationBreakdownTitle}
            breakdownSubtitle={`${allocationBreakdownSubtitle} · Amounts shown in ${overview.referenceCurrency}`}
            breadcrumbs={allocationDrillState.breadcrumbs}
            clampedPath={allocationDrillState.clampedPath}
            hasBreakdownAmountDiscrepancy={
              hasAllocationBreakdownAmountDiscrepancy
            }
            hasBreakdown={hasAllocationBreakdown}
            emptyBreakdownMessage={emptyAllocationBreakdownMessage}
            chartOptions={allocationChartOptions}
            onSelectedBreakdownChange={setSelectedAllocationBreakdown}
            onDrillPathChange={updateSelectedAllocationBreakdownPath}
            footer={
              hasAllocationPartialData ? (
                <Alert
                  mt="md"
                  variant="light"
                  color="yellow"
                  icon={<IconAlertTriangle size={16} />}
                  title="Partial data"
                >
                  {allocationPartialDataNotes}
                </Alert>
              ) : null
            }
          />
        </SimpleGrid>
      </Stack>

      {selectedPeriodValue !== overview.selectedPeriodValue ? (
        <Text c="dimmed" mt="sm" size="xs">
          Showing nearest supported period for the requested value.
        </Text>
      ) : null}
    </Container>
  );
}
