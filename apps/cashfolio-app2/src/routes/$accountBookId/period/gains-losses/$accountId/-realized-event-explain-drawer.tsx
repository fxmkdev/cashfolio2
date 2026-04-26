import {
  Alert,
  Badge,
  Card,
  Drawer,
  Group,
  SimpleGrid,
  Stack,
  Text,
} from "@mantine/core";
import type { ColDef } from "ag-grid-enterprise";
import { ExactValueTooltip } from "@/components/exact-value-tooltip";
import { DataGrid } from "@/components/data-grid";
import type { PeriodGainLossReconciliation } from "@/server/period-gain-loss-reconciliation";
import {
  formatExactNumber,
  formatExactNumberWithFormatter,
} from "@/shared/exact-value-format";
import {
  formatDateLabel,
  formatDescription,
  toEventSide,
} from "./-page-view-formatters";
import type {
  RealizedEventLotMatchRow,
  RealizedEventRow,
} from "./-page-view-types";

export function RealizedEventExplainDrawer(args: {
  opened: boolean;
  onClose: () => void;
  selectedEvent: RealizedEventRow | null;
  reconciliation: PeriodGainLossReconciliation;
  currencyFormatter: Intl.NumberFormat;
  realizedLotMatchColumns: ColDef<RealizedEventLotMatchRow>[];
}) {
  return (
    <Drawer
      opened={args.opened}
      onClose={args.onClose}
      position="right"
      size="xl"
      title="Explain Realised Delta"
    >
      {args.selectedEvent ? (
        <Stack gap="md">
          <Card withBorder radius="md" p="md">
            <Stack gap="xs">
              <Group justify="space-between" align="center">
                <Text fw={600}>
                  {args.reconciliation.target.accountName} ·{" "}
                  {args.reconciliation.target.unitLabel}
                </Text>
                <Badge
                  color={
                    toEventSide(args.selectedEvent) === "buy" ? "green" : "red"
                  }
                  variant="light"
                >
                  {toEventSide(args.selectedEvent) === "buy" ? "Buy" : "Sell"}
                </Badge>
              </Group>
              <Text size="sm" c="dimmed">
                {args.reconciliation.selectedPeriodLabel}
              </Text>
              <Text size="sm">
                Date: {formatDateLabel(args.selectedEvent.date)}
              </Text>
            </Stack>
          </Card>

          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <Card withBorder radius="md" p="md">
              <Text size="sm" c="dimmed">
                Transaction
              </Text>
              <Text fw={700}>
                {formatDescription(args.selectedEvent.transactionDescription)}
              </Text>
            </Card>
            <Card withBorder radius="md" p="md">
              <Text size="sm" c="dimmed">
                Quantity
              </Text>
              <ExactValueTooltip
                label={formatExactNumber(args.selectedEvent.rawQuantity)}
              >
                <Text fw={700}>
                  {args.selectedEvent.quantity.toLocaleString("en-CH")}
                </Text>
              </ExactValueTooltip>
            </Card>
            <Card withBorder radius="md" p="md">
              <Text size="sm" c="dimmed">
                Effective Amount
              </Text>
              <ExactValueTooltip
                label={formatExactNumberWithFormatter({
                  formatter: args.currencyFormatter,
                  value: args.selectedEvent.rawEffectiveReferenceAmount,
                })}
              >
                <Text fw={700}>
                  {args.currencyFormatter.format(
                    args.selectedEvent.effectiveReferenceAmount,
                  )}
                </Text>
              </ExactValueTooltip>
            </Card>
            <Card withBorder radius="md" p="md">
              <Text size="sm" c="dimmed">
                Execution Price
              </Text>
              <ExactValueTooltip
                label={formatExactNumberWithFormatter({
                  formatter: args.currencyFormatter,
                  value: args.selectedEvent.rawExecutionUnitPriceInReference,
                })}
              >
                <Text fw={700}>
                  {args.currencyFormatter.format(
                    args.selectedEvent.executionUnitPriceInReference,
                  )}
                </Text>
              </ExactValueTooltip>
            </Card>
            <Card withBorder radius="md" p="md">
              <Text size="sm" c="dimmed">
                Realised Delta
              </Text>
              <ExactValueTooltip
                label={formatExactNumberWithFormatter({
                  formatter: args.currencyFormatter,
                  value: args.selectedEvent.rawRealizedGainLossDelta,
                })}
              >
                <Text fw={700}>
                  {args.currencyFormatter.format(
                    args.selectedEvent.realizedGainLossDelta,
                  )}
                </Text>
              </ExactValueTooltip>
            </Card>
          </SimpleGrid>

          <Card withBorder radius="md" p="md">
            <Stack gap="sm">
              <Text fw={600}>Lot Matches</Text>
              {args.selectedEvent.lotMatches.length === 0 ? (
                <Alert color="yellow" variant="light" title="No lot matches">
                  No matched lots were captured for this event.
                </Alert>
              ) : (
                <div style={{ height: 280 }}>
                  <DataGrid
                    rowData={args.selectedEvent.lotMatches}
                    columnDefs={args.realizedLotMatchColumns}
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
  );
}
