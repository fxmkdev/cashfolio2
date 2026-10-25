import { GainLossSourceDetails } from "./-source-details";
import { Alert, Card, Group, Stack, Text, Title } from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import { useMemo, useState } from "react";
import { DataGrid } from "@/components/grid/data-grid";
import { PageBreadcrumbs } from "@/components/navigation/page-breadcrumbs";
import { PageShell } from "@/components/layout/page-shell";
import { TopPageHeader } from "@/components/layout/top-page-header";
import { PeriodFilterAction } from "../../../-period-filter-action";
import { DEFAULT_PERIOD_VALUE } from "../../-page-types";
import type { PeriodGainLossReconciliation } from "@/server/period-gain-loss-reconciliation";
import { formatMonthPeriodValue } from "@/shared/period";
import {
  buildPeriodSelectorModel,
  getMonthPickerValue,
  getPeriodModeChangeValue,
  getPeriodStepValue,
  getYearPickerValue,
} from "@/shared/period-selector-model";
import {
  buildRealizedColumns,
  buildRealizedLotMatchColumns,
  buildOpenLotColumns,
  DIAGNOSTICS_COLUMNS,
} from "./-page-view-columns";
import { buildCurrencyFormatter } from "./-page-view-formatters";
import type { RealizedEventRow } from "./-page-view-types";
import { RealizedEventExplainDrawer } from "./-realized-event-explain-drawer";
import { ReconciliationStatCards } from "./-reconciliation-stat-cards";
import {
  createDisplayNumberFormatter,
  getCurrencyDecimals,
  getUnitDisplayDecimals,
} from "@/shared/unit-format";
import { getGainLossReconciliationPageTitle } from "./-page-title";
import { useUserLocale } from "@/user-locale-context";

type GainLossReconciliationPageViewProps = {
  accountBookId: string;
  reportPeriodLabel: string;
  reportPeriodValue: string;
  selectedPeriodValue: string;
  reconciliation: PeriodGainLossReconciliation | null;
  onPeriodChange: (nextPeriodValue: string) => void;
  onOpenEventTransaction: (transactionId: string) => void;
  onOpenRecordedTransaction: (transactionId: string) => void;
};

type LoadedGainLossReconciliationPageViewProps = Omit<
  GainLossReconciliationPageViewProps,
  "reconciliation"
> & {
  heading: string;
  reconciliation: PeriodGainLossReconciliation;
};

function GainLossPageBreadcrumbs({
  accountBookId,
  reportPeriodLabel,
  reportPeriodValue,
  heading,
}: {
  accountBookId: string;
  reportPeriodLabel: string;
  reportPeriodValue: string;
  heading: string;
}) {
  return (
    <PageBreadcrumbs
      items={[
        {
          label: reportPeriodLabel,
          to: "/$accountBookId/report",
          params: { accountBookId },
          search: {
            period:
              reportPeriodValue === DEFAULT_PERIOD_VALUE
                ? undefined
                : reportPeriodValue,
          },
        },
        { label: heading },
      ]}
    />
  );
}

export function GainLossReconciliationPageView({
  accountBookId,
  reportPeriodLabel,
  reportPeriodValue,
  selectedPeriodValue,
  reconciliation,
  onPeriodChange,
  onOpenEventTransaction,
  onOpenRecordedTransaction,
}: GainLossReconciliationPageViewProps) {
  const heading = getGainLossReconciliationPageTitle(reconciliation);
  if (!reconciliation) {
    return (
      <PageShell>
        <TopPageHeader
          heading={
            <GainLossPageBreadcrumbs
              accountBookId={accountBookId}
              reportPeriodLabel={reportPeriodLabel}
              reportPeriodValue={reportPeriodValue}
              heading={heading}
            />
          }
        />
        <Alert color="yellow" variant="light" title="No Reconciliation Data">
          No gain/loss reconciliation is available for this account and period.
        </Alert>
      </PageShell>
    );
  }

  return (
    <LoadedGainLossReconciliationPageView
      accountBookId={accountBookId}
      reportPeriodLabel={reportPeriodLabel}
      reportPeriodValue={reportPeriodValue}
      selectedPeriodValue={selectedPeriodValue}
      reconciliation={reconciliation}
      heading={heading}
      onPeriodChange={onPeriodChange}
      onOpenEventTransaction={onOpenEventTransaction}
      onOpenRecordedTransaction={onOpenRecordedTransaction}
    />
  );
}

function LoadedGainLossReconciliationPageView({
  accountBookId,
  reportPeriodLabel,
  reportPeriodValue,
  selectedPeriodValue,
  reconciliation,
  heading,
  onPeriodChange,
  onOpenEventTransaction,
  onOpenRecordedTransaction,
}: LoadedGainLossReconciliationPageViewProps) {
  const userLocale = useUserLocale();
  const [pickerOpened, setPickerOpened] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const currencyFormatter = buildCurrencyFormatter(
    reconciliation.referenceCurrency,
    userLocale,
  );
  const referenceCurrencyDisplayDecimals = getCurrencyDecimals(
    reconciliation.referenceCurrency,
  );
  const unitPriceDisplayDecimals = Math.max(
    2,
    referenceCurrencyDisplayDecimals,
  );
  const quantityDisplayDecimals = getUnitDisplayDecimals({
    unit: reconciliation.target.unit,
    currency: reconciliation.target.currency,
    cryptocurrency: reconciliation.target.cryptocurrency,
  });
  const quantityFormatter = useMemo(
    () =>
      createDisplayNumberFormatter({
        locale: userLocale,
        decimals: quantityDisplayDecimals,
      }),
    [quantityDisplayDecimals, userLocale],
  );
  const periodSelectorModel = buildPeriodSelectorModel({
    selectedGranularity: reconciliation.selectedGranularity,
    selectedYear: reconciliation.selectedYear,
    selectedMonth: reconciliation.selectedMonth,
    minBookingDate: reconciliation.periodBounds.minBookingDate
      ? new Date(reconciliation.periodBounds.minBookingDate)
      : null,
    maxDate: new Date(reconciliation.periodBounds.maxDate),
  });
  const periodMode = periodSelectorModel.periodMode;

  const realizedColumns = useMemo(
    () =>
      buildRealizedColumns({
        isVirtualTarget: reconciliation.target.isVirtual,
        quantityDisplayDecimals,
        referenceCurrencyDisplayDecimals,
        unitPriceDisplayDecimals,
        onOpenEventTransaction,
      }),
    [
      onOpenEventTransaction,
      quantityDisplayDecimals,
      reconciliation.target.isVirtual,
      referenceCurrencyDisplayDecimals,
      unitPriceDisplayDecimals,
    ],
  );
  const realizedLotMatchColumns = useMemo(
    () =>
      buildRealizedLotMatchColumns({
        quantityDisplayDecimals,
        referenceCurrencyDisplayDecimals,
        unitPriceDisplayDecimals,
      }),
    [
      quantityDisplayDecimals,
      referenceCurrencyDisplayDecimals,
      unitPriceDisplayDecimals,
    ],
  );
  const openLotColumns = useMemo(
    () =>
      buildOpenLotColumns({
        quantityDisplayDecimals,
        referenceCurrencyDisplayDecimals,
        unitPriceDisplayDecimals,
      }),
    [
      quantityDisplayDecimals,
      referenceCurrencyDisplayDecimals,
      unitPriceDisplayDecimals,
    ],
  );

  const selectedEvent = useMemo<RealizedEventRow | null>(
    () =>
      selectedEventId
        ? (reconciliation.realizedEvents.find(
            (event) => event.id === selectedEventId,
          ) ?? null)
        : null,
    [reconciliation.realizedEvents, selectedEventId],
  );

  const handlePeriodModeChange = (nextMode: string) => {
    const nextPeriodValue = getPeriodModeChangeValue({
      nextMode,
      periodMode,
      selectedYear: reconciliation.selectedYear,
      selectedYearMaxMonth:
        periodSelectorModel.selectedYearMonthBounds.maxMonth,
    });
    if (nextPeriodValue) {
      onPeriodChange(nextPeriodValue);
    }
  };

  const handlePeriodStep = (step: -1 | 1) => {
    setPickerOpened(false);
    const nextPeriodValue = getPeriodStepValue({
      periodMode,
      step,
      selectedMonthIndex: periodSelectorModel.selectedMonthIndex,
      minMonthIndex: periodSelectorModel.minMonthIndex,
      maxMonthIndex: periodSelectorModel.maxMonthIndex,
      selectedYear: reconciliation.selectedYear,
      minYear: periodSelectorModel.minYear,
      maxYear: periodSelectorModel.maxYear,
    });
    if (nextPeriodValue) {
      onPeriodChange(nextPeriodValue);
    }
  };

  return (
    <PageShell>
      <TopPageHeader
        heading={
          <GainLossPageBreadcrumbs
            accountBookId={accountBookId}
            reportPeriodLabel={reportPeriodLabel}
            reportPeriodValue={reportPeriodValue}
            heading={heading}
          />
        }
        actions={
          <PeriodFilterAction
            selectedPeriodLabel={reconciliation.selectedPeriodLabel}
            periodMode={periodMode}
            pickerOpened={pickerOpened}
            onPickerOpenedChange={setPickerOpened}
            canGoToPreviousPeriod={periodSelectorModel.canGoToPreviousPeriod}
            canGoToNextPeriod={periodSelectorModel.canGoToNextPeriod}
            onPeriodModeChange={handlePeriodModeChange}
            onPeriodStep={handlePeriodStep}
            selectedMonthValue={`${formatMonthPeriodValue(
              reconciliation.selectedYear,
              periodSelectorModel.selectedMonth,
            )}-01`}
            selectedYearValue={`${String(reconciliation.selectedYear).padStart(4, "0")}-01-01`}
            monthPickerDefaultValue={`${formatMonthPeriodValue(
              reconciliation.selectedYear,
              periodSelectorModel.selectedMonth,
            )}-01`}
            yearPickerDefaultValue={`${String(reconciliation.selectedYear).padStart(4, "0")}-01-01`}
            minMonthPickerDate={periodSelectorModel.minMonthPickerDate}
            maxMonthPickerDate={periodSelectorModel.maxMonthPickerDate}
            minYearPickerDate={periodSelectorModel.minYearPickerDate}
            maxYearPickerDate={periodSelectorModel.maxYearPickerDate}
            onMonthPickerChange={(nextValue) => {
              const nextPeriodValue = getMonthPickerValue(nextValue);
              if (!nextPeriodValue) {
                return;
              }
              onPeriodChange(nextPeriodValue);
              setPickerOpened(false);
            }}
            onYearPickerChange={(nextValue) => {
              const nextPeriodValue = getYearPickerValue(nextValue);
              if (!nextPeriodValue) {
                return;
              }
              onPeriodChange(nextPeriodValue);
              setPickerOpened(false);
            }}
          />
        }
      />
      <Stack gap="lg">
        <ReconciliationStatCards
          summary={reconciliation.summary}
          currencyFormatter={currencyFormatter}
        />

        <GainLossSourceDetails
          sources={reconciliation.sources}
          currencyFormatter={currencyFormatter}
          onOpenTransaction={onOpenEventTransaction}
          onOpenRecordedTransaction={onOpenRecordedTransaction}
        />

        <Card withBorder radius="md" p="md">
          <Stack gap="sm">
            <Group justify="space-between" align="center">
              <Title order={4}>Realised Events</Title>
              <Text size="sm" c="dimmed">
                {reconciliation.realizedEvents.length} event(s)
              </Text>
            </Group>
            <Text size="xs" c="dimmed">
              Double-click an event row to explain the realised delta.
            </Text>
            <div style={{ height: 360 }}>
              <DataGrid
                rowData={reconciliation.realizedEvents}
                columnDefs={realizedColumns}
                defaultColDef={{
                  sortable: false,
                  suppressHeaderMenuButton: true,
                }}
                onRowDoubleClicked={(event) => {
                  if (!event.data) {
                    return;
                  }
                  setSelectedEventId(event.data.id);
                }}
              />
            </div>
          </Stack>
        </Card>

        <Card withBorder radius="md" p="md">
          <Stack gap="sm">
            <Group justify="space-between" align="center">
              <Title order={4}>Unrealised Open Lots</Title>
              <Text size="sm" c="dimmed">
                {reconciliation.unrealizedOpenLots.length} lot(s)
              </Text>
            </Group>
            <div style={{ height: 320 }}>
              <DataGrid
                rowData={reconciliation.unrealizedOpenLots}
                columnDefs={openLotColumns}
                defaultColDef={{
                  sortable: false,
                  suppressHeaderMenuButton: true,
                }}
              />
            </div>
          </Stack>
        </Card>

        {reconciliation.diagnostics.skippedCount > 0 ? (
          <Card withBorder radius="md" p="md">
            <Stack gap="sm">
              <Alert
                variant="light"
                color="yellow"
                icon={<IconAlertTriangle size={16} />}
                title="Partial Data"
              >
                {reconciliation.diagnostics.skippedCount} valuation-related
                item(s) were skipped because conversion or rate data was
                unavailable.
              </Alert>
              <div style={{ height: 260 }}>
                <DataGrid
                  rowData={reconciliation.diagnostics.items}
                  columnDefs={DIAGNOSTICS_COLUMNS}
                  defaultColDef={{
                    sortable: false,
                    suppressHeaderMenuButton: true,
                  }}
                />
              </div>
            </Stack>
          </Card>
        ) : null}
      </Stack>

      <RealizedEventExplainDrawer
        opened={selectedEvent != null}
        onClose={() => {
          setSelectedEventId(null);
        }}
        selectedEvent={selectedEvent}
        reconciliation={reconciliation}
        currencyFormatter={currencyFormatter}
        quantityFormatter={quantityFormatter}
        realizedLotMatchColumns={realizedLotMatchColumns}
      />

      {selectedPeriodValue !== reconciliation.selectedPeriodValue ? (
        <Text c="dimmed" mt="sm" size="xs">
          Showing nearest supported period for the requested value.
        </Text>
      ) : null}
    </PageShell>
  );
}
