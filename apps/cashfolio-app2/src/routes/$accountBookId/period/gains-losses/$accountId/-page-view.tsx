import {
  Alert,
  Card,
  Container,
  Divider,
  Drawer,
  Group,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import type {
  ColDef,
  ICellRendererParams,
  RowDoubleClickedEvent,
} from "ag-grid-enterprise";
import { useEffect, useMemo, useState } from "react";
import { FORMATTED_NUMERIC_COLUMN } from "@/components/column-types";
import { DataGrid } from "@/components/data-grid";
import { LinkAnchor } from "@/components/link-anchor";
import { LinkButton } from "@/components/link-button";
import { TopPageHeader } from "@/components/top-page-header";
import type { PeriodGainLossReconciliation } from "@/server/period-gain-loss-reconciliation";
import { normalizeExplicitPeriodValue } from "@/shared/period";
import { DEFAULT_PERIOD_VALUE } from "../../-page-types";

type GainLossReconciliationPageViewProps = {
  accountBookId: string;
  selectedPeriodValue: string;
  reconciliation: PeriodGainLossReconciliation | null;
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

function isLinkEventTarget(event: unknown): boolean {
  if (!(event instanceof MouseEvent)) {
    return false;
  }
  return event.target instanceof Element && event.target.closest("a") != null;
}

function getPricingSourceLabel(source: RealizedEventRow["pricing"]["source"]) {
  if (source === "directConversion") {
    return "Direct conversion";
  }
  if (source === "residualAdjusted") {
    return "Residual-adjusted";
  }
  return "Market fallback";
}

export function GainLossReconciliationPageView({
  accountBookId,
  selectedPeriodValue,
  reconciliation,
}: GainLossReconciliationPageViewProps) {
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const backSearch =
    selectedPeriodValue === DEFAULT_PERIOD_VALUE
      ? { period: undefined }
      : { period: selectedPeriodValue };

  const heading = reconciliation
    ? `${reconciliation.target.accountName} · ${reconciliation.target.unitLabel}`
    : "Gain/Loss Reconciliation";

  const currencyFormatter = useMemo(
    () => buildCurrencyFormatter(reconciliation?.referenceCurrency ?? "CHF"),
    [reconciliation?.referenceCurrency],
  );
  const targetAccountId = reconciliation?.target.accountId ?? null;
  const ledgerPeriodValue = normalizeExplicitPeriodValue(selectedPeriodValue);

  const selectedEvent = useMemo(
    () =>
      selectedEventId
        ? (reconciliation?.realizedEvents.find(
            (event) => event.id === selectedEventId,
          ) ?? null)
        : null,
    [reconciliation?.realizedEvents, selectedEventId],
  );
  useEffect(() => {
    if (selectedEventId && !selectedEvent) {
      setSelectedEventId(null);
    }
  }, [selectedEvent, selectedEventId]);

  const realizedColumns = useMemo<ColDef<RealizedEventRow>[]>(
    () => [
      {
        headerName: "Date",
        field: "date",
        width: 140,
      },
      {
        headerName: "Booking",
        field: "bookingId",
        width: 210,
      },
      {
        headerName: "Transaction",
        field: "transactionId",
        width: 210,
        cellRenderer: ({
          value,
        }: ICellRendererParams<RealizedEventRow, string | null>) => {
          if (!value) {
            return "—";
          }
          if (!targetAccountId || reconciliation?.target.isVirtual) {
            return value;
          }
          return (
            <LinkAnchor
              to="/$accountBookId/$accountId"
              params={{ accountBookId, accountId: targetAccountId }}
              search={{
                transactionId: value,
                period: ledgerPeriodValue,
              }}
              size="sm"
            >
              {value}
            </LinkAnchor>
          );
        },
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
        headerName: "Exec Price",
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
    ],
    [
      accountBookId,
      ledgerPeriodValue,
      reconciliation?.target.isVirtual,
      targetAccountId,
    ],
  );

  const realizedLotMatchColumns = useMemo<ColDef<RealizedEventLotMatchRow>[]>(
    () => [
      {
        headerName: "Acquired",
        field: "acquisitionDate",
        width: 140,
      },
      {
        headerName: "Source",
        field: "acquisitionBookingId",
        width: 220,
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
        headerName: "Exec Price",
        field: "executionUnitPriceInReference",
        width: 150,
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
      },
      {
        headerName: "Source",
        field: "acquisitionBookingId",
        width: 220,
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
        field: "bookingId",
        width: 220,
      },
      {
        headerName: "Transaction",
        field: "transactionId",
        width: 220,
      },
    ],
    [],
  );

  return (
    <Container fluid py="xl" px="xl">
      <TopPageHeader
        heading={<Title order={2}>{heading}</Title>}
        actions={
          <LinkButton
            to="/$accountBookId/period"
            params={{ accountBookId }}
            search={backSearch}
            variant="light"
          >
            Back to Period
          </LinkButton>
        }
      />

      {!reconciliation ? (
        <Alert color="yellow" variant="light" title="No reconciliation data">
          No gain/loss reconciliation is available for this account and period.
        </Alert>
      ) : (
        <>
          <Stack gap="lg">
            <Card withBorder radius="md" p="md">
              <Stack gap="xs">
                <Text fw={600}>Context</Text>
                <Text size="sm" c="dimmed">
                  {reconciliation.selectedPeriodLabel} ·{" "}
                  {reconciliation.referenceCurrency}
                </Text>
                <Text size="sm" c="dimmed">
                  {reconciliation.target.isVirtual
                    ? "Virtual transfer-clearing account"
                    : "Real asset/liability account"}
                </Text>
              </Stack>
            </Card>

            <SimpleGrid cols={{ base: 1, md: 3 }}>
              <Card withBorder radius="md" p="md">
                <Text size="sm" c="dimmed">
                  Realised
                </Text>
                <Text fw={700} fz="xl">
                  {currencyFormatter.format(
                    reconciliation.summary.realizedGainLoss,
                  )}
                </Text>
              </Card>
              <Card withBorder radius="md" p="md">
                <Text size="sm" c="dimmed">
                  Unrealised
                </Text>
                <Text fw={700} fz="xl">
                  {currencyFormatter.format(
                    reconciliation.summary.unrealizedGainLoss,
                  )}
                </Text>
              </Card>
              <Card withBorder radius="md" p="md">
                <Text size="sm" c="dimmed">
                  Total
                </Text>
                <Text fw={700} fz="xl">
                  {currencyFormatter.format(
                    reconciliation.summary.totalGainLoss,
                  )}
                </Text>
              </Card>
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
                    onRowDoubleClicked={(
                      event: RowDoubleClickedEvent<RealizedEventRow>,
                    ) => {
                      if (!event.data || isLinkEventTarget(event.event)) {
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
                    <Text fw={600}>
                      {reconciliation.target.accountName} ·{" "}
                      {reconciliation.target.unitLabel}
                    </Text>
                    <Text size="sm" c="dimmed">
                      {reconciliation.selectedPeriodLabel}
                    </Text>
                    <Group gap="md">
                      <Text size="sm">Date: {selectedEvent.date}</Text>
                      <Text size="sm">Booking: {selectedEvent.bookingId}</Text>
                      <Text size="sm">
                        Transaction: {selectedEvent.transactionId ?? "—"}
                      </Text>
                    </Group>
                  </Stack>
                </Card>

                <SimpleGrid cols={{ base: 1, sm: 2 }}>
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
                      Exec Price
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
                      <Alert
                        color="yellow"
                        variant="light"
                        title="No lot matches"
                      >
                        No matched lots were captured for this event.
                      </Alert>
                    ) : (
                      <div style={{ height: 250 }}>
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

                <Card withBorder radius="md" p="md">
                  <Stack gap="xs">
                    <Text fw={600}>Formula</Text>
                    <Text ff="monospace" size="sm">
                      Σ(lot deltas) ={" "}
                      {currencyFormatter.format(
                        selectedEvent.lotMatches.reduce(
                          (sum, lotMatch) =>
                            sum + lotMatch.realizedGainLossDelta,
                          0,
                        ),
                      )}{" "}
                      = Event realised delta{" "}
                      {currencyFormatter.format(
                        selectedEvent.realizedGainLossDelta,
                      )}
                    </Text>
                  </Stack>
                </Card>

                <Card withBorder radius="md" p="md">
                  <Stack gap="xs">
                    <Text fw={600}>Conversion / Rate Notes</Text>
                    <Text size="sm" c="dimmed">
                      Pricing source:{" "}
                      {getPricingSourceLabel(selectedEvent.pricing.source)}
                    </Text>
                    <Divider />
                    <Text size="sm">
                      Market reference amount:{" "}
                      {currencyFormatter.format(
                        selectedEvent.pricing.marketReferenceAmount,
                      )}
                    </Text>
                    <Text size="sm">
                      Residual allocation amount:{" "}
                      {currencyFormatter.format(
                        selectedEvent.pricing.residualAllocationAmount,
                      )}
                    </Text>
                    <Text size="sm">
                      Effective reference amount:{" "}
                      {currencyFormatter.format(
                        selectedEvent.pricing.effectiveReferenceAmount,
                      )}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {selectedEvent.pricing.source === "directConversion"
                        ? "Effective amount comes directly from converted booking values."
                        : selectedEvent.pricing.source === "residualAdjusted"
                          ? "Effective amount includes residual allocation to reconcile counterpart conversions."
                          : "Effective amount falls back to market conversion because direct counterpart conversion data was incomplete."}
                    </Text>
                  </Stack>
                </Card>

                <Card withBorder radius="md" p="md">
                  <Stack gap="xs">
                    <Text fw={600}>Rounding</Text>
                    <Text size="sm">
                      Realised delta raw{" "}
                      {selectedEvent.rounding.rawRealizedGainLossDelta.toLocaleString(
                        "en-CH",
                      )}{" "}
                      rounds to{" "}
                      {selectedEvent.rounding.roundedRealizedGainLossDelta.toLocaleString(
                        "en-CH",
                      )}
                      .
                    </Text>
                    <Text size="sm">
                      Running realised raw{" "}
                      {selectedEvent.rounding.rawRunningRealizedGainLoss.toLocaleString(
                        "en-CH",
                      )}{" "}
                      rounds to{" "}
                      {selectedEvent.rounding.roundedRunningRealizedGainLoss.toLocaleString(
                        "en-CH",
                      )}
                      .
                    </Text>
                  </Stack>
                </Card>
              </Stack>
            ) : null}
          </Drawer>
        </>
      )}
    </Container>
  );
}
