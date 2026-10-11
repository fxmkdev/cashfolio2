import { Alert, Stack, Text, Title } from "@mantine/core";
import { useMemo, useState } from "react";
import type { AccountGainLossDetails } from "@/shared/account-gain-loss";
import { formatUtcDateForLocale } from "@/shared/date";
import { useUserLocale } from "@/user-locale-context";
import {
  createDisplayNumberFormatter,
  getCurrencyDecimals,
  getUnitDisplayDecimals,
} from "@/shared/unit-format";
import { DataGrid } from "@/components/grid/data-grid";
import {
  buildOpenLotColumns,
  buildRealizedColumns,
  buildRealizedLotMatchColumns,
} from "./columns";
import { RealizedEventExplainDrawer } from "./realized-event-explain-drawer";
import { GainLossSummaryValues } from "./account-gain-loss-summary";
export function AccountGainLossCalculation({
  data,
  onOpenTransaction,
}: {
  data: AccountGainLossDetails;
  onOpenTransaction: (transactionId: string) => void;
}) {
  const locale = useUserLocale();
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const currencyFormatter = createDisplayNumberFormatter({
    locale,
    style: "currency",
    currency: data.referenceCurrency,
    decimals: getCurrencyDecimals(data.referenceCurrency),
  });
  const decimals = useMemo(
    () => ({
      quantityDisplayDecimals: getUnitDisplayDecimals(data.target),
      referenceCurrencyDisplayDecimals: getCurrencyDecimals(
        data.referenceCurrency,
      ),
      unitPriceDisplayDecimals: Math.max(
        5,
        getCurrencyDecimals(data.referenceCurrency),
      ),
    }),
    [data.target, data.referenceCurrency],
  );
  const realizedColumns = useMemo(
    () =>
      buildRealizedColumns({
        ...decimals,
        isVirtualTarget: false,
        onOpenEventTransaction: onOpenTransaction,
      }),
    [decimals, onOpenTransaction],
  );
  const openColumns = useMemo(
    () =>
      buildOpenLotColumns<number | null>(decimals).map((column) => ({
        ...column,
        ...(column.field === "periodEndRate"
          ? { headerName: "As-of Rate" }
          : {}),
        ...([
          "periodEndRate",
          "unrealizedGainLoss",
          "runningUnrealizedGainLoss",
        ].includes(column.field ?? "")
          ? {
              cellRenderer: ({
                value,
                valueFormatted,
              }: {
                value: number | null;
                valueFormatted: string | null;
              }) => (value == null ? "—" : valueFormatted),
            }
          : {}),
      })),
    [decimals],
  );
  const matchedColumns = buildRealizedLotMatchColumns(decimals);
  const label = `Since ${formatUtcDateForLocale(new Date(data.startDate), locale)} · As of ${formatUtcDateForLocale(new Date(data.asOfDate), locale)}`;
  const selectedEvent =
    data.realizedEvents.find((event) => event.id === selectedEventId) ?? null;
  return (
    <Stack gap="md">
      <Title order={4}>{data.accountName}</Title>
      <Text size="sm" c="dimmed">
        {label}
      </Text>
      <GainLossSummaryValues
        summary={data.summary}
        referenceCurrency={data.referenceCurrency}
      />
      {data.diagnostics.length ? (
        <Alert title="Incomplete Gain/Loss" color="yellow">
          {data.diagnostics.map((item, index) => (
            <Text key={index} size="sm">
              {formatUtcDateForLocale(new Date(item.date), locale)}:{" "}
              {item.message}
            </Text>
          ))}
        </Alert>
      ) : null}
      <Title order={5}>Realised Events</Title>
      <Text size="xs" c="dimmed">
        Select an event to inspect its FIFO lot matches and execution pricing.
      </Text>
      <DataGrid
        containerStyle={{ height: 320 }}
        rowData={data.realizedEvents}
        columnDefs={realizedColumns}
        onRowClicked={({ data: event }) =>
          setSelectedEventId(event?.id ?? null)
        }
      />
      <Title order={5}>Unrealised Open Lots</Title>
      <DataGrid
        containerStyle={{ height: 320 }}
        rowData={data.unrealizedOpenLots}
        columnDefs={openColumns}
      />
      <RealizedEventExplainDrawer
        opened={!!selectedEvent}
        onClose={() => setSelectedEventId(null)}
        selectedEvent={selectedEvent}
        reconciliation={{ target: data.target, selectedPeriodLabel: label }}
        currencyFormatter={currencyFormatter}
        quantityFormatter={createDisplayNumberFormatter({
          locale,
          decimals: decimals.quantityDisplayDecimals,
        })}
        realizedLotMatchColumns={matchedColumns}
      />
    </Stack>
  );
}
