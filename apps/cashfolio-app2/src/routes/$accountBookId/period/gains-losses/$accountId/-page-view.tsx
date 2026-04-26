import {
  ActionIcon,
  Alert,
  Badge,
  Card,
  Container,
  Drawer,
  Group,
  SimpleGrid,
  Stack,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import { IconAlertTriangle, IconSquareArrowRight } from "@tabler/icons-react";
import type { ColDef, ICellRendererParams } from "ag-grid-enterprise";
import { format } from "date-fns";
import { useMemo, useState } from "react";
import {
  DATE_COLUMN,
  FORMATTED_NUMERIC_COLUMN,
} from "@/components/column-types";
import { DataGrid } from "@/components/data-grid";
import { TopPageHeader } from "@/components/top-page-header";
import type { PeriodGainLossReconciliation } from "@/server/period-gain-loss-reconciliation";
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

type GainLossReconciliationPageViewProps = {
  selectedPeriodValue: string;
  reconciliation: PeriodGainLossReconciliation | null;
  onPeriodChange: (nextPeriodValue: string) => void;
  onOpenEventTransaction: (transactionId: string) => void;
};

type RealizedEventRow = PeriodGainLossReconciliation["realizedEvents"][number];
type RealizedEventLotMatchRow = RealizedEventRow["lotMatches"][number];
type OpenLotRow = PeriodGainLossReconciliation["unrealizedOpenLots"][number];
type DiagnosticRow =
  PeriodGainLossReconciliation["diagnostics"]["items"][number];

function buildCurrencyFormatter(currency: string) {
  return new Intl.NumberFormat("en-CH", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDescription(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "—";
}

function toEventSide(event: RealizedEventRow): "buy" | "sell" | "flat" {
  if (event.quantity > 0) {
    return "buy";
  }
  if (event.quantity < 0) {
    return "sell";
  }
  return "flat";
}

function formatDateLabel(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return "—";
  }
  return format(date, "dd.MM.yyyy");
}

function StatCard(args: {
  label: string;
  value: string;
  valueColor: "green" | "red";
}) {
  return (
    <Card withBorder radius="md" p="lg">
      <Stack gap={4} align="center">
        <Text c="dimmed" fw={600} ta="center">
          {args.label}
        </Text>
        <Text fw={700} fz="xl" c={args.valueColor}>
          {args.value}
        </Text>
      </Stack>
    </Card>
  );
}

export function GainLossReconciliationPageView({
  selectedPeriodValue,
  reconciliation,
  onPeriodChange,
  onOpenEventTransaction,
}: GainLossReconciliationPageViewProps) {
  const [pickerOpened, setPickerOpened] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const heading = reconciliation
    ? `${reconciliation.target.accountName} · ${reconciliation.target.unitLabel}`
    : "Gain/Loss Reconciliation";
  const currencyFormatter = useMemo(
    () => buildCurrencyFormatter(reconciliation?.referenceCurrency ?? "CHF"),
    [reconciliation?.referenceCurrency],
  );
  const selectedEvent = useMemo(
    () =>
      selectedEventId
        ? (reconciliation?.realizedEvents.find(
            (event) => event.id === selectedEventId,
          ) ?? null)
        : null,
    [reconciliation?.realizedEvents, selectedEventId],
  );

  const realizedColumns = useMemo<ColDef<RealizedEventRow>[]>(
    () => [
      {
        headerName: "Side",
        colId: "side",
        width: 110,
        cellRenderer: ({ data }: ICellRendererParams<RealizedEventRow>) => {
          if (!data) {
            return "—";
          }
          const side = toEventSide(data);
          if (side === "flat") {
            return <Badge variant="light">Flat</Badge>;
          }
          return (
            <Badge color={side === "buy" ? "green" : "red"} variant="light">
              {side === "buy" ? "Buy" : "Sell"}
            </Badge>
          );
        },
      },
      {
        headerName: "Date",
        field: "date",
        width: 140,
        type: DATE_COLUMN,
        valueFormatter: ({ value }) => formatDateLabel(value),
      },
      {
        headerName: "Transaction",
        field: "transactionDescription",
        minWidth: 220,
        flex: 1,
        valueFormatter: ({ value }) => formatDescription(value),
      },
      {
        headerName: "Quantity",
        field: "quantity",
        width: 140,
        type: FORMATTED_NUMERIC_COLUMN,
      },
      {
        headerName: "Effective Amount",
        field: "effectiveReferenceAmount",
        width: 180,
        type: FORMATTED_NUMERIC_COLUMN,
      },
      {
        headerName: "Exec. Price",
        field: "executionUnitPriceInReference",
        width: 150,
        type: FORMATTED_NUMERIC_COLUMN,
      },
      {
        headerName: "Realised Delta",
        field: "realizedGainLossDelta",
        width: 160,
        type: FORMATTED_NUMERIC_COLUMN,
      },
      {
        headerName: "Running Realised",
        field: "runningRealizedGainLoss",
        width: 180,
        type: FORMATTED_NUMERIC_COLUMN,
      },
      {
        colId: "actions",
        headerName: "",
        width: 84,
        sortable: false,
        filter: false,
        resizable: false,
        suppressHeaderMenuButton: true,
        cellClass: "actions-cell",
        cellRenderer: ({ data }: ICellRendererParams<RealizedEventRow>) => {
          if (!data) {
            return null;
          }
          const canOpenLedger =
            !!data.transactionId && !reconciliation?.target.isVirtual;
          const tooltipLabel = canOpenLedger
            ? "Open in ledger"
            : "No ledger transaction";
          return (
            <Group gap={4} wrap="nowrap" h="100%" align="center">
              <Tooltip label={tooltipLabel}>
                <span style={{ display: "inline-flex" }}>
                  <ActionIcon
                    variant="subtle"
                    size="sm"
                    disabled={!canOpenLedger}
                    aria-label={tooltipLabel}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (!canOpenLedger || !data.transactionId) {
                        return;
                      }
                      onOpenEventTransaction(data.transactionId);
                    }}
                    onDoubleClick={(event) => {
                      event.stopPropagation();
                    }}
                  >
                    <IconSquareArrowRight size={16} />
                  </ActionIcon>
                </span>
              </Tooltip>
            </Group>
          );
        },
      },
    ],
    [onOpenEventTransaction, reconciliation?.target.isVirtual],
  );

  const realizedLotMatchColumns = useMemo<ColDef<RealizedEventLotMatchRow>[]>(
    () => [
      {
        headerName: "Acquired",
        field: "acquisitionDate",
        width: 140,
        type: DATE_COLUMN,
        valueFormatter: ({ value }) => formatDateLabel(value),
      },
      {
        headerName: "Matched Qty",
        field: "matchedQuantity",
        width: 140,
        type: FORMATTED_NUMERIC_COLUMN,
      },
      {
        headerName: "Lot Unit Cost",
        field: "lotUnitCostInReference",
        width: 160,
        type: FORMATTED_NUMERIC_COLUMN,
      },
      {
        headerName: "Execution Price",
        field: "executionUnitPriceInReference",
        width: 160,
        type: FORMATTED_NUMERIC_COLUMN,
      },
      {
        headerName: "Lot Delta",
        field: "realizedGainLossDelta",
        width: 140,
        type: FORMATTED_NUMERIC_COLUMN,
      },
      {
        headerName: "Running Event Realised",
        field: "runningRealizedGainLoss",
        width: 190,
        type: FORMATTED_NUMERIC_COLUMN,
      },
    ],
    [],
  );

  const openLotColumns = useMemo<ColDef<OpenLotRow>[]>(
    () => [
      {
        headerName: "Acquired",
        field: "acquisitionDate",
        width: 140,
        type: DATE_COLUMN,
        valueFormatter: ({ value }) => formatDateLabel(value),
      },
      {
        headerName: "Quantity",
        field: "quantity",
        width: 140,
        type: FORMATTED_NUMERIC_COLUMN,
      },
      {
        headerName: "Unit Cost",
        field: "unitCostInReference",
        width: 150,
        type: FORMATTED_NUMERIC_COLUMN,
      },
      {
        headerName: "Period-End Rate",
        field: "periodEndRate",
        width: 160,
        type: FORMATTED_NUMERIC_COLUMN,
      },
      {
        headerName: "Unrealised",
        field: "unrealizedGainLoss",
        width: 160,
        type: FORMATTED_NUMERIC_COLUMN,
      },
      {
        headerName: "Running Unrealised",
        field: "runningUnrealizedGainLoss",
        width: 190,
        type: FORMATTED_NUMERIC_COLUMN,
      },
    ],
    [],
  );

  const diagnosticsColumns = useMemo<ColDef<DiagnosticRow>[]>(
    () => [
      {
        headerName: "Date",
        field: "date",
        width: 140,
        type: DATE_COLUMN,
        valueFormatter: ({ value }) => formatDateLabel(value),
      },
      {
        headerName: "Reason",
        field: "reason",
        width: 180,
      },
      {
        headerName: "Message",
        field: "message",
        flex: 1,
      },
      {
        headerName: "Booking",
        field: "bookingDescription",
        minWidth: 220,
        valueFormatter: ({ value }) => formatDescription(value),
      },
      {
        headerName: "Transaction",
        field: "transactionDescription",
        minWidth: 220,
        valueFormatter: ({ value }) => formatDescription(value),
      },
    ],
    [],
  );

  if (!reconciliation) {
    return (
      <Container fluid py="xl" px="xl">
        <TopPageHeader heading={<Title order={2}>{heading}</Title>} />
        <Alert color="yellow" variant="light" title="No reconciliation data">
          No gain/loss reconciliation is available for this account and period.
        </Alert>
      </Container>
    );
  }

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
      <TopPageHeader heading={<Title order={2}>{heading}</Title>} />
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
            selectedMonthValue={`${String(reconciliation.selectedYear).padStart(4, "0")}-${String((reconciliation.selectedMonth ?? 0) + 1).padStart(2, "0")}-01`}
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

        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="lg">
          <StatCard
            label="Realised"
            value={currencyFormatter.format(
              reconciliation.summary.realizedGainLoss,
            )}
            valueColor={
              reconciliation.summary.realizedGainLoss >= 0 ? "green" : "red"
            }
          />
          <StatCard
            label="Unrealised"
            value={currencyFormatter.format(
              reconciliation.summary.unrealizedGainLoss,
            )}
            valueColor={
              reconciliation.summary.unrealizedGainLoss >= 0 ? "green" : "red"
            }
          />
          <StatCard
            label="Total"
            value={currencyFormatter.format(
              reconciliation.summary.totalGainLoss,
            )}
            valueColor={
              reconciliation.summary.totalGainLoss >= 0 ? "green" : "red"
            }
          />
        </SimpleGrid>

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
                title="Partial data"
              >
                {reconciliation.diagnostics.skippedCount} valuation-related
                item(s) were skipped because conversion or rate data was
                unavailable.
              </Alert>
              <div style={{ height: 260 }}>
                <DataGrid
                  rowData={reconciliation.diagnostics.items}
                  columnDefs={diagnosticsColumns}
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

      <Drawer
        opened={selectedEvent != null}
        onClose={() => {
          setSelectedEventId(null);
        }}
        position="right"
        size="xl"
        title="Explain Realised Delta"
      >
        {selectedEvent ? (
          <Stack gap="md">
            <Card withBorder radius="md" p="md">
              <Stack gap="xs">
                <Group justify="space-between" align="center">
                  <Text fw={600}>
                    {reconciliation.target.accountName} ·{" "}
                    {reconciliation.target.unitLabel}
                  </Text>
                  <Badge
                    color={
                      toEventSide(selectedEvent) === "buy" ? "green" : "red"
                    }
                    variant="light"
                  >
                    {toEventSide(selectedEvent) === "buy" ? "Buy" : "Sell"}
                  </Badge>
                </Group>
                <Text size="sm" c="dimmed">
                  {reconciliation.selectedPeriodLabel}
                </Text>
                <Text size="sm">
                  Date: {formatDateLabel(selectedEvent.date)}
                </Text>
              </Stack>
            </Card>

            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <Card withBorder radius="md" p="md">
                <Text size="sm" c="dimmed">
                  Transaction
                </Text>
                <Text fw={700}>
                  {formatDescription(selectedEvent.transactionDescription)}
                </Text>
              </Card>
              <Card withBorder radius="md" p="md">
                <Text size="sm" c="dimmed">
                  Quantity
                </Text>
                <Text fw={700}>
                  {selectedEvent.quantity.toLocaleString("en-CH")}
                </Text>
              </Card>
              <Card withBorder radius="md" p="md">
                <Text size="sm" c="dimmed">
                  Effective Amount
                </Text>
                <Text fw={700}>
                  {currencyFormatter.format(
                    selectedEvent.effectiveReferenceAmount,
                  )}
                </Text>
              </Card>
              <Card withBorder radius="md" p="md">
                <Text size="sm" c="dimmed">
                  Execution Price
                </Text>
                <Text fw={700}>
                  {currencyFormatter.format(
                    selectedEvent.executionUnitPriceInReference,
                  )}
                </Text>
              </Card>
              <Card withBorder radius="md" p="md">
                <Text size="sm" c="dimmed">
                  Realised Delta
                </Text>
                <Text fw={700}>
                  {currencyFormatter.format(
                    selectedEvent.realizedGainLossDelta,
                  )}
                </Text>
              </Card>
            </SimpleGrid>

            <Card withBorder radius="md" p="md">
              <Stack gap="sm">
                <Text fw={600}>Lot Matches</Text>
                {selectedEvent.lotMatches.length === 0 ? (
                  <Alert color="yellow" variant="light" title="No lot matches">
                    No matched lots were captured for this event.
                  </Alert>
                ) : (
                  <div style={{ height: 280 }}>
                    <DataGrid
                      rowData={selectedEvent.lotMatches}
                      columnDefs={realizedLotMatchColumns}
                      defaultColDef={{
                        sortable: false,
                        suppressHeaderMenuButton: true,
                      }}
                    />
                  </div>
                )}
              </Stack>
            </Card>
          </Stack>
        ) : null}
      </Drawer>

      {selectedPeriodValue !== reconciliation.selectedPeriodValue ? (
        <Text c="dimmed" mt="sm" size="xs">
          Showing nearest supported period for the requested value.
        </Text>
      ) : null}
    </Container>
  );
}
