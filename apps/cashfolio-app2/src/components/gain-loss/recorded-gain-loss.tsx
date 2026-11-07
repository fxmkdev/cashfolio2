import { Button, Stack, Text, Title } from "@mantine/core";
import type { ColDef } from "ag-grid-enterprise";
import { useMemo } from "react";
import { DataGrid } from "@/components/grid/data-grid";
import type { AccountGainLossSourceRow } from "@/shared/gain-loss-reconciliation";
import { formatUtcDateForLocale } from "@/shared/date";
import { useUserLocale } from "@/user-locale-context";
import {
  createDisplayNumberFormatter,
  getCurrencyDecimals,
} from "@/shared/unit-format";

export function RecordedGainLoss({
  rows,
  referenceCurrency,
  onOpenTransaction,
}: {
  rows: AccountGainLossSourceRow[];
  referenceCurrency: string;
  onOpenTransaction: (transactionId: string) => void;
}) {
  const locale = useUserLocale();
  const columns = useMemo<ColDef<AccountGainLossSourceRow>[]>(() => {
    const formatter = createDisplayNumberFormatter({
      locale,
      style: "currency",
      currency: referenceCurrency,
      decimals: getCurrencyDecimals(referenceCurrency),
    });
    return [
      {
        field: "date",
        headerName: "Date",
        width: 140,
        valueFormatter: ({ value }) =>
          formatUtcDateForLocale(new Date(value), locale),
      },
      {
        field: "description",
        headerName: "Description",
        flex: 1,
        minWidth: 160,
      },
      {
        field: "amount",
        headerName: `Amount (${referenceCurrency})`,
        width: 180,
        valueFormatter: ({ value }) => formatter.format(value),
      },
      {
        colId: "transaction",
        headerName: "Transaction",
        width: 170,
        cellRenderer: ({ data }: { data?: AccountGainLossSourceRow }) =>
          data ? (
            <Button
              variant="subtle"
              size="xs"
              onClick={() => onOpenTransaction(data.transactionId)}
            >
              Open Transaction
            </Button>
          ) : null,
      },
    ];
  }, [locale, referenceCurrency, onOpenTransaction]);
  if (!rows.length) return null;
  return (
    <Stack gap="sm">
      <Title order={5}>Recorded Adjustments</Title>
      <Text size="xs" c="dimmed">
        Recorded adjustments are included in Realised G/L for reporting.
        Recording an adjustment does not establish economic realisation.
      </Text>
      <DataGrid
        containerStyle={{ height: 240 }}
        rowData={rows}
        columnDefs={columns}
      />
    </Stack>
  );
}
