import { Alert, Button, Stack, Text, Title } from "@mantine/core";
import type { ColDef } from "ag-grid-enterprise";
import { DataGrid } from "@/components/grid/data-grid";
import { formatUtcDateForLocale } from "@/shared/date";
import type {
  AccountReturnCashFlow,
  AccountReturnDetails,
  AccountReturnValuation,
} from "@/shared/accounts/account-returns";
import { useUserLocale } from "@/user-locale-context";
import { ReturnValue } from "./return-values";

export function ReturnCalculation({
  data,
  onOpenTransaction,
}: {
  data: AccountReturnDetails;
  onOpenTransaction?: (id: string, date: string) => void;
}) {
  const locale = useUserLocale();
  const date = (value: string) =>
    formatUtcDateForLocale(new Date(`${value}T00:00:00Z`), locale);
  const money = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: data.referenceCurrency,
  });
  const amount = ({ value }: { value: number | null | undefined }) =>
    value == null ? "—" : money.format(value);
  const valuationColumns: ColDef<AccountReturnValuation>[] = [
    {
      field: "date",
      headerName: "Date",
      valueFormatter: ({ value }) => date(value),
    },
    {
      field: "kind",
      headerName: "Purpose",
      valueFormatter: ({ value }) =>
        ({
          opening: "Opening Value",
          intermediate: "Valuation",
          closing: "Closing Value",
        })[value as AccountReturnValuation["kind"]],
    },
    {
      field: "value",
      headerName: `Value (${data.referenceCurrency})`,
      valueFormatter: amount,
      type: "numericColumn",
    },
  ];
  const flowColumns: ColDef<AccountReturnCashFlow>[] = [
    {
      field: "date",
      headerName: "Date",
      valueFormatter: ({ value }) => date(value),
    },
    { field: "description", headerName: "Description", flex: 1, minWidth: 200 },
    {
      field: "amount",
      headerName: "Capital Movement",
      type: "numericColumn",
      valueFormatter: amount,
    },
    ...(onOpenTransaction
      ? [
          {
            colId: "transaction",
            headerName: "Transaction",
            cellRenderer: ({ data: flow }: { data?: AccountReturnCashFlow }) =>
              flow?.transactionId ? (
                <Button
                  variant="subtle"
                  size="xs"
                  onClick={() =>
                    onOpenTransaction(flow.transactionId!, flow.date)
                  }
                >
                  Open Transaction
                </Button>
              ) : null,
          },
        ]
      : [
          {
            field: "transactionId",
            headerName: "Transaction",
          } as ColDef<AccountReturnCashFlow>,
        ]),
  ];
  return (
    <Stack gap="md">
      <Title order={4}>{data.name}</Title>
      <Text size="sm">
        Reporting range: {date(data.startDate)} – {date(data.asOfDate)}
      </Text>
      {data.effectiveStartDate && data.effectiveEndDate ? (
        <Text size="sm">
          Investment span: {date(data.effectiveStartDate)} –{" "}
          {date(data.effectiveEndDate)}
        </Text>
      ) : null}
      <ReturnValue data={data} basis="cumulative" />
      <ReturnValue data={data} basis="annualized" />
      {data.diagnostics.length ? (
        <Alert title="Return Calculation Notes" color="yellow">
          {[
            ...new Set(
              data.diagnostics.map((item) =>
                item.date
                  ? `${date(item.date)}: ${item.message}`
                  : item.message,
              ),
            ),
          ].map((message) => (
            <Text size="sm" key={message}>
              {message}
            </Text>
          ))}
        </Alert>
      ) : null}
      <Text size="sm">
        Return uses the money-weighted method, accounting for the amounts and
        dates invested or withdrawn. The calculation uses actual days/365:
        contributions and opening capital enter at day start; withdrawals and
        terminal value use the following day boundary. Valuations show
        accounting-day closing values; opening holdings use the day before book
        start. Annualized figures require an effective investment span of at
        least 365 days.
      </Text>
      <Text size="sm">
        Return includes price/FX performance and recorded G/L adjustments,
        excluding dividends, interest, and separately booked fees. Transfers use
        market value. Group returns include idle cash and holdings in transit,
        and cancel internal movements. FIFO G/L retains acquisition costs and
        can differ from performance during ownership. Total value accounts use
        recorded balances.
      </Text>
      <Title order={5}>Valuations</Title>
      <DataGrid
        containerStyle={{ height: 320 }}
        rowData={data.valuations}
        columnDefs={valuationColumns}
      />
      <Title order={5}>Capital Movements</Title>
      <Text size="xs" c="dimmed">
        Positive amounts are contributions; negative amounts are withdrawals.
        Opening and terminal values are shown in the valuation table.
      </Text>
      <DataGrid
        containerStyle={{ height: 280 }}
        rowData={data.cashFlows}
        columnDefs={flowColumns}
      />
    </Stack>
  );
}
