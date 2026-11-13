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
import { ReturnValues } from "./return-values";

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
      field: "startDate",
      headerName: "From",
      valueFormatter: ({ value }) => date(value),
    },
    {
      field: "date",
      headerName: "Through",
      valueFormatter: ({ value }) => date(value),
    },
    ...(
      [
        ["openingValue", "Opening Value"],
        ["contributions", "Contributions"],
        ["withdrawals", "Withdrawals"],
        ["closingValue", "Closing Value"],
      ] as const
    ).map(([field, headerName]) => ({
      field,
      headerName,
      valueFormatter: amount,
      type: "numericColumn",
    })),
    {
      field: "factor",
      headerName: "TWR Factor",
      type: "numericColumn",
      valueFormatter: ({ value }) =>
        value == null
          ? "—"
          : new Intl.NumberFormat(locale, { maximumFractionDigits: 8 }).format(
              value,
            ),
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
      <ReturnValues data={data} basis="cumulative" />
      {data.annualizedTwr !== null || data.annualizedMwr !== null ? (
        <ReturnValues data={data} basis="annualized" />
      ) : null}
      {data.diagnostics.length ? (
        <Alert title="Return Calculation Notes" color="yellow">
          {[
            ...new Set(
              data.diagnostics.map(
                (item) =>
                  `${item.metric === "both" ? "TWR/MWR" : item.metric.toUpperCase()}: ${item.message}`,
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
        TWR links valuation factors, treating contributions at day start and
        withdrawals at day end. MWR reflects the timing and size of capital
        movements using actual days/365; day-end withdrawals and terminal value
        use the following day boundary. Annualized figures are available for
        investment spans of at least 365 days.
      </Text>
      <Text size="sm">
        Returns include price/FX performance and recorded G/L adjustments,
        excluding dividends, interest, and separately booked fees. Transfers use
        market value. Group returns include idle cash and holdings in transit,
        and cancel internal movements. FIFO G/L retains acquisition costs and
        can differ from performance during ownership. Total value accounts use
        recorded balances.
      </Text>
      <Title order={5}>Valuations and TWR Factors</Title>
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
