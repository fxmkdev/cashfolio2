import {
  Alert,
  Grid,
  SimpleGrid,
  Stack,
  Text,
  Title,
  useComputedColorScheme,
  useMantineTheme,
} from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import { useCallback, useMemo } from "react";
import { ensureChartModulesRegistered } from "@/ag-chart-modules";
import { PeriodFilterAction } from "../-period-filter-action";
import { TopPageHeader } from "@/components/top-page-header";
import { PageShell } from "@/components/page-shell";
import type { getPeriodOverview } from "@/server/period";
import { getDashboardChartThemeColors } from "@/shared/dashboard-chart-theme";
import {
  createDisplayNumberFormatter,
  getCurrencyDecimals,
} from "@/shared/unit-format";
import { useUserLocale } from "@/user-locale-context";
import { PeriodAllocationBreakdownCard } from "./-breakdown/-allocation-breakdown-card";
import { ContributionChartCard } from "./-contribution-chart-card";
import { PeriodBreakdownCard } from "./-breakdown/-breakdown-card";
import { GainsLossesCard } from "./-gains-losses/-gains-losses-card";
import { usePeriodAllocationBreakdownViewModel } from "./-breakdown/-period-allocation-breakdown-view-model";
import { usePeriodBreakdownViewModel } from "./-breakdown/-period-breakdown-view-model";
import { usePeriodGainsLossesViewModel } from "./-period-gains-losses-view-model";
import { buildReportPageStats } from "./-report-page-stats";
import type { NetWorthReconciliationModel } from "./-net-worth/-net-worth-reconciliation";
import {
  PeriodNetWorthReconciliationWarning,
  PeriodSkippedValuationWarning,
} from "./-page-warning";
import { PeriodStatsCardsSection } from "./-period-stats-cards";
import { useReportPageSessionState } from "./-selector/-page-session-state";
import { useReportPeriodFilterActionProps } from "./-selector/-period-filter-action-props";
import { useSyncedReportDrillPaths } from "./-report-page-drill-path-sync";

ensureChartModulesRegistered();

type PeriodOverview = Awaited<ReturnType<typeof getPeriodOverview>>;

export type ReportPageViewProps = {
  accountBookId: string;
  overview: PeriodOverview;
  selectedPeriodValue: string;
  netWorthReconciliation?: NetWorthReconciliationModel | null;
  onPeriodChange: (nextPeriodValue: string) => void;
  onBreakdownAccountDoubleClick: (accountId: string) => void;
  onExplicitGainLossDoubleClick?: () => void;
  onGainLossUnitAccountDoubleClick?: (accountId: string) => void;
};

export function ReportPageView({
  accountBookId,
  overview,
  selectedPeriodValue,
  netWorthReconciliation = null,
  onPeriodChange,
  onBreakdownAccountDoubleClick,
  onExplicitGainLossDoubleClick,
  onGainLossUnitAccountDoubleClick,
}: ReportPageViewProps) {
  const userLocale = useUserLocale();
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
  } = useReportPageSessionState(accountBookId);
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
      createDisplayNumberFormatter({
        locale: userLocale,
        style: "currency",
        currency: overview.referenceCurrency,
        decimals: getCurrencyDecimals(overview.referenceCurrency),
      }),
    [overview.referenceCurrency, userLocale],
  );
  const referenceCurrencyDisplayDecimals = useMemo(
    () => getCurrencyDecimals(overview.referenceCurrency),
    [overview.referenceCurrency],
  );

  const percentageFormatter = useMemo(
    () =>
      new Intl.NumberFormat(userLocale, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }),
    [userLocale],
  );
  const savingsRateFormatter = useMemo(
    () =>
      new Intl.NumberFormat(userLocale, {
        style: "percent",
        minimumFractionDigits: 0,
        maximumFractionDigits: 1,
      }),
    [userLocale],
  );

  const periodFilterActionProps = useReportPeriodFilterActionProps({
    overview,
    onPeriodChange,
  });
  useSyncedReportDrillPaths({
    drillPathByBreakdown,
    drillPathByAllocationBreakdown,
    drillPathByGainsLosses,
    expenseBreakdownHierarchy: overview.expenseBreakdown.hierarchy,
    incomeBreakdownHierarchy: overview.incomeBreakdown.hierarchy,
    assetBreakdownHierarchy: overview.assetBreakdown.hierarchy,
    liabilityBreakdownHierarchy: overview.liabilityBreakdown.hierarchy,
    gainsLossesBreakdownHierarchy: overview.gainsLossesBreakdown.hierarchy,
    setDrillPathByBreakdown,
    setDrillPathByAllocationBreakdown,
    setDrillPathByGainsLosses,
  });
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
    onUnitAccountDoubleClick: onGainLossUnitAccountDoubleClick,
  });

  const { statCards, endOfPeriodStatCards } = buildReportPageStats({
    overview,
    currencyFormatter,
    savingsRateFormatter,
  });

  return (
    <PageShell>
      <TopPageHeader
        heading={<Title order={2}>{overview.selectedPeriodLabel}</Title>}
        actions={<PeriodFilterAction {...periodFilterActionProps} />}
      />

      <Stack gap="lg">
        <PeriodNetWorthReconciliationWarning
          reconciliation={netWorthReconciliation}
          currencyFormatter={currencyFormatter}
        />

        <PeriodStatsCardsSection
          statCards={statCards}
          endOfPeriodStatCards={endOfPeriodStatCards}
        />
        <PeriodSkippedValuationWarning
          skippedBookingsCount={overview.skippedBookingsCount}
        />

        <Stack gap="lg" data-testid="period-analysis-section">
          <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
            <ContributionChartCard
              stats={overview.stats}
              currencyFormatter={currencyFormatter}
              locale={userLocale}
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
              displayDecimals={referenceCurrencyDisplayDecimals}
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
                    title="Partial Data"
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
                displayDecimals={referenceCurrencyDisplayDecimals}
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
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, lg: 6 }}>
              <GainsLossesCard
                selectedChartType={selectedGainsLossesChartType}
                displayDecimals={referenceCurrencyDisplayDecimals}
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
                onExplicitGainLossDoubleClick={onExplicitGainLossDoubleClick}
                onUnitAccountDoubleClick={onGainLossUnitAccountDoubleClick}
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
    </PageShell>
  );
}
