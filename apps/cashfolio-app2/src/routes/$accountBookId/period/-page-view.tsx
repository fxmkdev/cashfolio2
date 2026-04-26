import {
  Alert,
  Container,
  Grid,
  SimpleGrid,
  Stack,
  Text,
  Title,
  useComputedColorScheme,
  useMantineTheme,
} from "@mantine/core";
import { IconAlertTriangle, IconListDetails } from "@tabler/icons-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ensureChartModulesRegistered } from "@/ag-chart-modules";
import { LinkButton } from "@/components/link-button";
import { TopPageHeader } from "@/components/top-page-header";
import type { getPeriodOverview } from "@/server/period";
import { getDashboardChartThemeColors } from "@/shared/dashboard-chart-theme";
import { formatMonthPeriodValue } from "@/shared/period";
import { PeriodAllocationBreakdownCard } from "./-allocation-breakdown-card";
import { ContributionChartCard } from "./-contribution-chart-card";
import { PeriodBreakdownCard } from "./-breakdown-card";
import { clampBreakdownPath } from "./-breakdown-drill";
import { GainsLossesCard } from "./-gains-losses-card";
import { clampGainsLossesPath } from "./-gains-losses-drill";
import { usePeriodAllocationBreakdownViewModel } from "./-period-allocation-breakdown-view-model";
import { usePeriodBreakdownViewModel } from "./-period-breakdown-view-model";
import { usePeriodGainsLossesViewModel } from "./-period-gains-losses-view-model";
import { buildPeriodPageStats } from "./-period-page-stats";
import { PeriodStatsCardsSection } from "./-period-stats-cards";
import { usePeriodPageSessionState } from "./-page-session-state";
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
  onPeriodChange: (nextPeriodValue: string) => void;
  onBreakdownAccountDoubleClick: (accountId: string) => void;
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

export function PeriodPageView({
  accountBookId,
  overview,
  selectedPeriodValue,
  onPeriodChange,
  onBreakdownAccountDoubleClick,
}: PeriodPageViewProps) {
  const {
    selectedBreakdown,
    selectedChartType,
    selectedAllocationBreakdown,
    selectedAllocationChartType,
    selectedGainsLossesChartType,
    drillPathByBreakdown,
    drillPathByAllocationBreakdown,
    drillPathByGainsLosses,
    setSelectedBreakdown,
    setSelectedChartType,
    setSelectedAllocationBreakdown,
    setSelectedAllocationChartType,
    setSelectedGainsLossesChartType,
    setDrillPathByBreakdown,
    setDrillPathByAllocationBreakdown,
    setDrillPathByGainsLosses,
  } = usePeriodPageSessionState(accountBookId);
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

    setDrillPathByBreakdown({
      expense: nextExpensePath,
      income: nextIncomePath,
    });
  }, [
    drillPathByBreakdown.expense,
    drillPathByBreakdown.income,
    overview.expenseBreakdown.hierarchy,
    overview.incomeBreakdown.hierarchy,
    setDrillPathByBreakdown,
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

    setDrillPathByAllocationBreakdown({
      asset: nextAssetPath,
      liability: nextLiabilityPath,
    });
  }, [
    drillPathByAllocationBreakdown.asset,
    drillPathByAllocationBreakdown.liability,
    overview.assetBreakdown.hierarchy,
    overview.liabilityBreakdown.hierarchy,
    setDrillPathByAllocationBreakdown,
  ]);
  useEffect(() => {
    const nextGainsLossesPath = clampGainsLossesPath({
      hierarchy: overview.gainsLossesBreakdown.hierarchy,
      path: drillPathByGainsLosses,
    });

    if (arePathsEqual(nextGainsLossesPath, drillPathByGainsLosses)) {
      return;
    }

    setDrillPathByGainsLosses(nextGainsLossesPath);
  }, [
    drillPathByGainsLosses,
    overview.gainsLossesBreakdown.hierarchy,
    setDrillPathByGainsLosses,
  ]);
  const breakdown = usePeriodBreakdownViewModel({
    accountBookId,
    overview,
    selectedBreakdown,
    selectedChartType,
    drillPathByBreakdown,
    setDrillPathByBreakdown,
    currencyFormatter,
    percentageFormatter,
    colors,
    onBreakdownAccountDoubleClick,
  });
  const onAllocationBreakdownAccountDoubleClick = useCallback(
    (accountId: string) => {
      if (accountId.startsWith("virtual:")) {
        return;
      }

      onBreakdownAccountDoubleClick(accountId);
    },
    [onBreakdownAccountDoubleClick],
  );

  const allocationBreakdown = usePeriodAllocationBreakdownViewModel({
    accountBookId,
    overview,
    selectedAllocationBreakdown,
    selectedAllocationChartType,
    drillPathByAllocationBreakdown,
    setDrillPathByAllocationBreakdown,
    currencyFormatter,
    percentageFormatter,
    colors,
    onBreakdownAccountDoubleClick: onAllocationBreakdownAccountDoubleClick,
  });
  const gainsLosses = usePeriodGainsLossesViewModel({
    accountBookId,
    gainsLossesBreakdownHierarchy: overview.gainsLossesBreakdown.hierarchy,
    selectedGainsLossesChartType,
    drillPathByGainsLosses,
    setDrillPathByGainsLosses,
    currencyFormatter,
    colors,
    waterfallPalette,
  });

  const { statCards, endOfPeriodStatCards } = buildPeriodPageStats({
    overview,
    currencyFormatter,
    savingsRateFormatter,
  });

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

        <PeriodStatsCardsSection
          statCards={statCards}
          endOfPeriodStatCards={endOfPeriodStatCards}
        />

        <Stack gap="lg" data-testid="period-analysis-section">
          <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
            <ContributionChartCard
              stats={overview.stats}
              currencyFormatter={currencyFormatter}
              colors={colors}
              waterfallPalette={waterfallPalette}
            />

            <PeriodAllocationBreakdownCard
              selectedBreakdown={selectedAllocationBreakdown}
              selectedChartType={selectedAllocationChartType}
              tableExpandedGroupsStorageKey={
                allocationBreakdown.allocationTableExpandedGroupsStorageKey
              }
              breakdownTitle={allocationBreakdown.allocationBreakdownTitle}
              breakdownSubtitle={`${allocationBreakdown.allocationBreakdownSubtitle} · Amounts shown in ${overview.referenceCurrency}`}
              breadcrumbs={allocationBreakdown.allocationDrillState.breadcrumbs}
              clampedPath={allocationBreakdown.allocationDrillState.clampedPath}
              hasBreakdownAmountDiscrepancy={
                allocationBreakdown.hasAllocationBreakdownAmountDiscrepancy
              }
              hasBreakdown={allocationBreakdown.hasAllocationBreakdown}
              emptyBreakdownMessage={
                allocationBreakdown.emptyAllocationBreakdownMessage
              }
              breakdownHierarchy={
                allocationBreakdown.activeAllocationBreakdown.hierarchy
              }
              chartOptions={allocationBreakdown.allocationChartOptions}
              onSelectedBreakdownChange={setSelectedAllocationBreakdown}
              onSelectedChartTypeChange={setSelectedAllocationChartType}
              onDrillPathChange={
                allocationBreakdown.updateSelectedAllocationBreakdownPath
              }
              onBreakdownAccountDoubleClick={
                onAllocationBreakdownAccountDoubleClick
              }
              onChartContainerDoubleClick={
                allocationBreakdown.handleAllocationChartContainerDoubleClick
              }
              footer={
                allocationBreakdown.hasAllocationPartialData ? (
                  <Alert
                    mt="md"
                    variant="light"
                    color="yellow"
                    icon={<IconAlertTriangle size={16} />}
                    title="Partial data"
                  >
                    {allocationBreakdown.allocationPartialDataNotes}
                  </Alert>
                ) : null
              }
            />
          </SimpleGrid>

          <Grid gap="lg">
            <Grid.Col span={{ base: 12, lg: 6 }}>
              <PeriodBreakdownCard
                selectedBreakdown={selectedBreakdown}
                selectedChartType={selectedChartType}
                tableExpandedGroupsStorageKey={
                  breakdown.breakdownTableExpandedGroupsStorageKey
                }
                breakdownTitle={breakdown.breakdownTitle}
                breakdownSubtitle={breakdown.breakdownSubtitle}
                breadcrumbs={breakdown.drillState.breadcrumbs}
                clampedPath={breakdown.drillState.clampedPath}
                hasBreakdownAmountDiscrepancy={
                  breakdown.hasBreakdownAmountDiscrepancy
                }
                hasBreakdown={breakdown.hasBreakdown}
                emptyBreakdownMessage={breakdown.emptyBreakdownMessage}
                breakdownHierarchy={breakdown.activeBreakdown.hierarchy}
                chartOptions={breakdown.chartOptions}
                onSelectedBreakdownChange={setSelectedBreakdown}
                onSelectedChartTypeChange={setSelectedChartType}
                onDrillPathChange={breakdown.updateSelectedBreakdownPath}
                onBreakdownAccountDoubleClick={onBreakdownAccountDoubleClick}
                onChartContainerDoubleClick={
                  breakdown.handleChartContainerDoubleClick
                }
                footer={
                  overview.skippedBookingsCount > 0 ? (
                    <Alert
                      mt="md"
                      variant="light"
                      color="yellow"
                      icon={<IconAlertTriangle size={16} />}
                      title="Partial data"
                    >
                      {overview.skippedBookingsCount} valuation-related item(s)
                      were skipped because valuation data was unavailable.
                    </Alert>
                  ) : null
                }
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, lg: 6 }}>
              <GainsLossesCard
                selectedChartType={selectedGainsLossesChartType}
                tableExpandedGroupsStorageKey={
                  gainsLosses.gainsLossesTableExpandedGroupsStorageKey
                }
                subtitle={`${gainsLosses.gainsLossesSubtitle} · Amounts shown in ${overview.referenceCurrency}`}
                breadcrumbs={gainsLosses.gainsLossesDrillState.breadcrumbs}
                clampedPath={gainsLosses.gainsLossesDrillState.clampedPath}
                hasGainsLosses={gainsLosses.hasGainsLosses}
                emptyMessage={gainsLosses.emptyGainsLossesMessage}
                hierarchy={overview.gainsLossesBreakdown.hierarchy}
                chartOptions={gainsLosses.gainsLossesChartOptions}
                onSelectedChartTypeChange={setSelectedGainsLossesChartType}
                onDrillPathChange={gainsLosses.updateGainsLossesDrillPath}
                onChartContainerDoubleClick={
                  gainsLosses.handleChartContainerDoubleClick
                }
              />
            </Grid.Col>
          </Grid>
        </Stack>
      </Stack>

      {selectedPeriodValue !== overview.selectedPeriodValue ? (
        <Text c="dimmed" mt="sm" size="xs">
          Showing nearest supported period for the requested value.
        </Text>
      ) : null}
    </Container>
  );
}
