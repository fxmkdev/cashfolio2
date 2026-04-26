import {
  Alert,
  Button,
  Card,
  Container,
  Group,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { IconAlertTriangle, IconArrowLeft } from "@tabler/icons-react";
import { useMemo, useState } from "react";
import { DataGrid } from "@/components/data-grid";
import { TopPageHeader } from "@/components/top-page-header";
import type { PeriodGainLossReconciliation } from "@/server/period-gain-loss-reconciliation";
import { formatMonthPeriodValue } from "@/shared/period";
import {
  buildPeriodSelectorModel,
  getMonthPickerValue,
  getPeriodModeChangeValue,
  getPeriodStepValue,
  getYearPickerValue,
  type PeriodMode,
} from "@/shared/period-selector-model";
import periodClasses from "../../-page-view.module.css";
import { PeriodSelectorCard } from "../../-selector-card";
import {
  buildRealizedColumns,
  DIAGNOSTICS_COLUMNS,
  OPEN_LOT_COLUMNS,
  REALIZED_LOT_MATCH_COLUMNS,
} from "./-page-view-columns";
import { buildCurrencyFormatter } from "./-page-view-formatters";
import type { RealizedEventRow } from "./-page-view-types";
import { RealizedEventExplainDrawer } from "./-realized-event-explain-drawer";
import { ReconciliationStatCards } from "./-reconciliation-stat-cards";

type ExactValueByField = Record<string, number | null | undefined>;

function addRealizedEventExactValues(
  event: RealizedEventRow,
): RealizedEventRow & { __exactByField: ExactValueByField } {
  return {
    ...event,
    __exactByField: {
      quantity: event.rawQuantity,
      effectiveReferenceAmount: event.rawEffectiveReferenceAmount,
      executionUnitPriceInReference: event.rawExecutionUnitPriceInReference,
      realizedGainLossDelta: event.rawRealizedGainLossDelta,
      runningRealizedGainLoss: event.rawRunningRealizedGainLoss,
    },
    lotMatches: event.lotMatches.map((lotMatch) => ({
      ...lotMatch,
      __exactByField: {
        matchedQuantity: lotMatch.rawMatchedQuantity,
        lotUnitCostInReference: lotMatch.rawLotUnitCostInReference,
        executionUnitPriceInReference:
          lotMatch.rawExecutionUnitPriceInReference,
        realizedGainLossDelta: lotMatch.rawRealizedGainLossDelta,
        runningEventRealizedGainLoss: lotMatch.rawRunningEventRealizedGainLoss,
      },
    })),
  };
}

function addOpenLotExactValues(
  lot: PeriodGainLossReconciliation["unrealizedOpenLots"][number],
) {
  return {
    ...lot,
    __exactByField: {
      quantity: lot.rawQuantity,
      unitCostInReference: lot.rawUnitCostInReference,
      periodEndRate: lot.rawPeriodEndRate,
      unrealizedGainLoss: lot.rawUnrealizedGainLoss,
      runningUnrealizedGainLoss: lot.rawRunningUnrealizedGainLoss,
    },
  };
}

type GainLossReconciliationPageViewProps = {
  selectedPeriodValue: string;
  reconciliation: PeriodGainLossReconciliation | null;
  onPeriodChange: (nextPeriodValue: string) => void;
  onOpenEventTransaction: (transactionId: string) => void;
  onBackToPeriod: () => void;
};

export function GainLossReconciliationPageView({
  selectedPeriodValue,
  reconciliation,
  onPeriodChange,
  onOpenEventTransaction,
  onBackToPeriod,
}: GainLossReconciliationPageViewProps) {
  const [pickerOpened, setPickerOpened] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const heading = reconciliation
    ? `${reconciliation.target.accountName} · ${reconciliation.target.unitLabel}`
    : "Gain/Loss Reconciliation";

  const headerActions = (
    <Button
      variant="default"
      leftSection={<IconArrowLeft size={16} />}
      onClick={onBackToPeriod}
    >
      Back to Period
    </Button>
  );

  if (!reconciliation) {
    return (
      <Container fluid py="xl" px="xl">
        <TopPageHeader
          heading={<Title order={2}>{heading}</Title>}
          actions={headerActions}
        />
        <Alert color="yellow" variant="light" title="No reconciliation data">
          No gain/loss reconciliation is available for this account and period.
        </Alert>
      </Container>
    );
  }

  const currencyFormatter = buildCurrencyFormatter(
    reconciliation.referenceCurrency,
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
        onOpenEventTransaction,
      }),
    [onOpenEventTransaction, reconciliation.target.isVirtual],
  );
  const realizedRows = useMemo(
    () => reconciliation.realizedEvents.map(addRealizedEventExactValues),
    [reconciliation.realizedEvents],
  );
  const unrealizedOpenLotRows = useMemo(
    () => reconciliation.unrealizedOpenLots.map(addOpenLotExactValues),
    [reconciliation.unrealizedOpenLots],
  );

  const selectedEvent = useMemo<RealizedEventRow | null>(
    () =>
      selectedEventId
        ? (realizedRows.find((event) => event.id === selectedEventId) ?? null)
        : null,
    [realizedRows, selectedEventId],
  );

  const handlePeriodModeChange = (nextMode: string) => {
    setPickerOpened(false);
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
    <Container fluid py="xl" px="xl">
      <TopPageHeader
        heading={<Title order={2}>{heading}</Title>}
        actions={headerActions}
      />
      <Stack gap="lg">
        <div className={periodClasses.periodTopSection}>
          <PeriodSelectorCard
            selectedPeriodLabel={reconciliation.selectedPeriodLabel}
            referenceCurrency={reconciliation.referenceCurrency}
            periodMode={periodMode as PeriodMode}
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
        </div>

        <ReconciliationStatCards
          summary={reconciliation.summary}
          summaryRaw={reconciliation.summaryRaw}
          currencyFormatter={currencyFormatter}
        />

        <Card withBorder radius="md" p="md">
          <Stack gap="sm">
            <Group justify="space-between" align="center">
              <Title order={4}>Realised Events</Title>
              <Text size="sm" c="dimmed">
                {realizedRows.length} event(s)
              </Text>
            </Group>
            <Text size="xs" c="dimmed">
              Double-click an event row to explain the realised delta.
            </Text>
            <div style={{ height: 360 }}>
              <DataGrid
                rowData={realizedRows}
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
                {unrealizedOpenLotRows.length} lot(s)
              </Text>
            </Group>
            <div style={{ height: 320 }}>
              <DataGrid
                rowData={unrealizedOpenLotRows}
                columnDefs={OPEN_LOT_COLUMNS}
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
                title="Partial data"
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
        realizedLotMatchColumns={REALIZED_LOT_MATCH_COLUMNS}
      />

      {selectedPeriodValue !== reconciliation.selectedPeriodValue ? (
        <Text c="dimmed" mt="sm" size="xs">
          Showing nearest supported period for the requested value.
        </Text>
      ) : null}
    </Container>
  );
}
