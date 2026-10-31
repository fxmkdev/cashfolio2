import {
  Card,
  Group,
  SegmentedControl,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useMemo, type ReactNode } from "react";
import type { PeriodHistoryResponse } from "@/server/period-history";
import { TopPageHeader } from "@/components/layout/top-page-header";
import { PageShell } from "@/components/layout/page-shell";
import {
  getHistoryMetricLabel,
  isHistoryPeriodMode,
  type HistoryMetric,
  type HistoryPeriodMode,
  type HistoryViewSelection,
} from "./-page-types";
import { isHistoryScopedMetric } from "@/shared/history-scope";
import { HistoryViewSelect } from "./-view-select";
import {
  resolveHistoryAccountDrillTarget,
  type HistoryAccountDrillTarget,
} from "./-account-drilldown";
import { HistoryChart } from "./-chart";
import { useHistoryChartModel } from "./-use-chart-model";
import classes from "./-page-view.module.css";

export type HistoryPageViewProps = {
  accountBookId: string;
  selectedMode: HistoryPeriodMode;
  selectedMetric: HistoryMetric;
  isViewPending: boolean;
  history: PeriodHistoryResponse;
  loadError?: ReactNode;
  onAccountPeriodDoubleClick: (
    target: HistoryAccountDrillTarget,
    periodValue: string,
  ) => void;
  onModeChange: (mode: HistoryPeriodMode) => void;
  onViewChange: (selection: HistoryViewSelection) => void;
};

export function HistoryPageView({
  accountBookId,
  selectedMode,
  selectedMetric,
  isViewPending,
  history,
  loadError,
  onAccountPeriodDoubleClick,
  onModeChange,
  onViewChange,
}: HistoryPageViewProps) {
  const activeReferenceCurrency = history.referenceCurrency;
  const selectedMetricSeriesLabel = useMemo(() => {
    if (!isHistoryScopedMetric(selectedMetric)) {
      return undefined;
    }

    const selectedScope = history.scopeSelection[selectedMetric];
    if (selectedScope === "total") {
      return undefined;
    }

    const option = history.scopeOptions[selectedMetric].find(
      (option) => option.value === selectedScope,
    );
    if (selectedMetric === "gainsLosses" && option) {
      return `By ${option.grouping === "accountStructure" ? "Account Structure" : "Asset Class"} / ${option.label}`;
    }
    return selectedMetric === "netWorth"
      ? (option?.treeLabel ?? option?.label)
      : option?.label;
  }, [selectedMetric, history.scopeOptions, history.scopeSelection]);
  const shouldShowCashFlowEmptyState =
    selectedMetric === "cashFlow" && history.hasCashAccounts === false;
  const drillTarget = useMemo(
    () =>
      resolveHistoryAccountDrillTarget({
        metric: selectedMetric,
        scope: isHistoryScopedMetric(selectedMetric)
          ? history.scopeSelection[selectedMetric]
          : undefined,
        options: isHistoryScopedMetric(selectedMetric)
          ? history.scopeOptions[selectedMetric]
          : [],
      }),
    [selectedMetric, history.scopeSelection, history.scopeOptions],
  );
  const { chartRef, chartOptions, chartData } = useHistoryChartModel({
    accountBookId,
    selectedMode,
    selectedMetric,
    history,
    selectedMetricSeriesLabel,
    drillTarget,
    onAccountPeriodDoubleClick,
  });
  return (
    <PageShell className={classes.page}>
      <TopPageHeader
        heading={<Title order={2}>History</Title>}
        actions={
          <SegmentedControl
            disabled={isViewPending}
            value={selectedMode}
            aria-label="History Period Mode"
            data={[
              { label: "Monthly", value: "month" },
              { label: "Yearly", value: "year" },
            ]}
            onChange={(nextMode) => {
              if (isHistoryPeriodMode(nextMode)) {
                onModeChange(nextMode);
              }
            }}
          />
        }
      />

      <Card withBorder radius="md" p="lg" className={classes.chartCard}>
        {loadError}
        <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
          <Stack gap={4}>
            <Text fw={600}>
              {(selectedMetric === "netWorth"
                ? selectedMetricSeriesLabel
                : undefined) ?? getHistoryMetricLabel(selectedMetric)}{" "}
              by Period
            </Text>
            <Text c="dimmed" size="sm">
              Amounts shown in {activeReferenceCurrency}
            </Text>
          </Stack>
          <div className={classes.metricControls}>
            <HistoryViewSelect
              disabled={isViewPending}
              selectedMetric={selectedMetric}
              scopeSelection={history.scopeSelection}
              scopeOptions={history.scopeOptions}
              onViewChange={onViewChange}
            />
          </div>
        </Group>

        {drillTarget &&
          !shouldShowCashFlowEmptyState &&
          chartData.length > 0 && (
            <Text c="dimmed" size="sm" mt="sm">
              {drillTarget.kind === "reconciliation"
                ? "Double-click a period to open gain/loss reconciliation."
                : "Double-click a period to open ledger."}
            </Text>
          )}

        {shouldShowCashFlowEmptyState ? (
          <div className={classes.emptyState}>
            <Text c="dimmed" ta="center">
              No accounts are included in cash flow for this account book.
            </Text>
          </div>
        ) : chartData.length === 0 ? (
          <Text c="dimmed" mt="md">
            No periods available yet.
          </Text>
        ) : (
          <div className={classes.chartContainer}>
            <HistoryChart chartRef={chartRef} chartOptions={chartOptions} />
          </div>
        )}
      </Card>
    </PageShell>
  );
}
