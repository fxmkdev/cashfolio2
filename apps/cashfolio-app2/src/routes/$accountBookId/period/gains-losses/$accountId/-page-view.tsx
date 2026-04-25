import {
  Alert,
  Card,
  Container,
  Group,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import type { ColDef } from "ag-grid-enterprise";
import { useMemo } from "react";
import { FORMATTED_NUMERIC_COLUMN } from "@/components/column-types";
import { DataGrid } from "@/components/data-grid";
import { LinkButton } from "@/components/link-button";
import { TopPageHeader } from "@/components/top-page-header";
import type { PeriodGainLossReconciliation } from "@/server/period-gain-loss-reconciliation";
import { DEFAULT_PERIOD_VALUE } from "../../-page-types";

type GainLossReconciliationPageViewProps = {
  accountBookId: string;
  selectedPeriodValue: string;
  reconciliation: PeriodGainLossReconciliation | null;
};

type RealizedEventRow = PeriodGainLossReconciliation["realizedEvents"][number];
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

export function GainLossReconciliationPageView({
  accountBookId,
  selectedPeriodValue,
  reconciliation,
}: GainLossReconciliationPageViewProps) {
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
        headerName: "Realized Delta",
        field: "realizedGainLossDelta",
        width: 160,
        type: FORMATTED_NUMERIC_COLUMN,
      },
      {
        headerName: "Running Realized",
        field: "runningRealizedGainLoss",
        width: 180,
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
        headerName: "Unrealized",
        field: "unrealizedGainLoss",
        width: 160,
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
                Realized
              </Text>
              <Text fw={700} fz="xl">
                {currencyFormatter.format(
                  reconciliation.summary.realizedGainLoss,
                )}
              </Text>
            </Card>
            <Card withBorder radius="md" p="md">
              <Text size="sm" c="dimmed">
                Unrealized
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
                {currencyFormatter.format(reconciliation.summary.totalGainLoss)}
              </Text>
            </Card>
          </SimpleGrid>

          <Card withBorder radius="md" p="md">
            <Stack gap="sm">
              <Group justify="space-between" align="center">
                <Title order={4}>Realized Events</Title>
                <Text size="sm" c="dimmed">
                  {reconciliation.realizedEvents.length} event(s)
                </Text>
              </Group>
              <div style={{ height: 360 }}>
                <DataGrid
                  rowData={reconciliation.realizedEvents}
                  columnDefs={realizedColumns}
                  defaultColDef={{
                    sortable: false,
                    suppressHeaderMenuButton: true,
                  }}
                />
              </div>
            </Stack>
          </Card>

          <Card withBorder radius="md" p="md">
            <Stack gap="sm">
              <Group justify="space-between" align="center">
                <Title order={4}>Unrealized Open Lots</Title>
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
      )}
    </Container>
  );
}
