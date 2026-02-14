import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { Anchor, Badge, Container, Group, Title } from "@mantine/core";
import { IconArrowLeft } from "@tabler/icons-react";
import type { ColDef, ICellRendererParams } from "ag-grid-enterprise";
import { DataGrid } from "../../components/data-grid";
import { getAccountForLedger, getLedgerData } from "../../server/ledger";
import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../../.prisma-client/enums";

export const Route = createFileRoute("/$accountBookId/$accountId")({
  loader: async ({ params: { accountBookId, accountId } }) => {
    const [account, bookings] = await Promise.all([
      getAccountForLedger({ data: { accountId, accountBookId } }),
      getLedgerData({ data: { accountId, accountBookId } }),
    ]);
    return { account, bookings };
  },
  component: LedgerPage,
});

function formatNumber(value: number): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function shouldNegate(
  type: AccountType,
  equityAccountSubtype: EquityAccountSubtype | null,
): boolean {
  return (
    type === AccountType.LIABILITY ||
    (type === AccountType.EQUITY &&
      equityAccountSubtype !== EquityAccountSubtype.EXPENSE)
  );
}

function getUnitLabel(account: {
  unit: Unit | null;
  currency: string | null;
  cryptocurrency: string | null;
  tradeCurrency: string | null;
}): string | null {
  if (!account.unit) return null;
  switch (account.unit) {
    case Unit.CURRENCY:
      return account.currency;
    case Unit.SECURITY:
      return account.tradeCurrency;
    case Unit.CRYPTOCURRENCY:
      return account.cryptocurrency;
  }
}

type LedgerRow = {
  id: string;
  date: string;
  counterpartyAccounts: { id: string; name: string }[];
  description: string;
  debit: number | null;
  credit: number | null;
  balance: number;
};

function LedgerPage() {
  const { account, bookings } = Route.useLoaderData();
  const { accountBookId } = Route.useParams();

  const rows = useMemo<LedgerRow[]>(() => {
    const negate = shouldNegate(account.type, account.equityAccountSubtype);
    let balance = 0;

    return bookings.map((b) => {
      const rawValue = Number(b.value);
      const value = negate ? -rawValue : rawValue;
      balance += value;

      return {
        id: b.id,
        date: new Date(b.date).toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
        }),
        counterpartyAccounts: b.counterpartyAccounts,
        description: b.description || b.transactionDescription,
        debit: value > 0 ? value : null,
        credit: value < 0 ? -value : null,
        balance,
      };
    }).reverse();
  }, [account, bookings]);

  const columnDefs = useMemo<ColDef<LedgerRow>[]>(
    () => [
      {
        field: "date",
        headerName: "Date",
        width: 130,
      },
      {
        field: "counterpartyAccounts",
        headerName: "Account(s)",
        flex: 1,
        cellRenderer: ({
          value,
        }: ICellRendererParams<LedgerRow, LedgerRow["counterpartyAccounts"]>) => {
          if (!value) return null;
          return value.map((a, i) => (
            <span key={a.id}>
              {i > 0 && ", "}
              <Link
                to="/$accountBookId/$accountId"
                params={{ accountBookId, accountId: a.id }}
                style={{ textDecoration: "none" }}
              >
                <Anchor component="span" size="sm">
                  {a.name}
                </Anchor>
              </Link>
            </span>
          ));
        },
      },
      {
        field: "description",
        headerName: "Description",
        width: 400,
      },
      {
        field: "debit",
        headerName: "Debit",
        width: 130,
        type: "rightAligned",
        valueFormatter: ({ value }) =>
          value != null ? formatNumber(value) : "",
      },
      {
        field: "credit",
        headerName: "Credit",
        width: 130,
        type: "rightAligned",
        valueFormatter: ({ value }) =>
          value != null ? formatNumber(value) : "",
      },
      {
        field: "balance",
        headerName: "Balance",
        width: 130,
        type: "rightAligned",
        valueFormatter: ({ value }) =>
          value != null ? formatNumber(value) : "",
      },
    ],
    [accountBookId],
  );

  const unitLabel = getUnitLabel(account);

  return (
    <Container fluid py="xl" px="xl">
      <Group mb="lg" gap="md">
        <Link
          to="/$accountBookId"
          params={{ accountBookId }}
          search={{ tab: "ASSET" }}
        >
          <IconArrowLeft size={20} />
        </Link>
        <Title order={2}>{account.name}</Title>
        {unitLabel && (
          <Badge size="lg" color="gray">
            {unitLabel}
          </Badge>
        )}
      </Group>

      <DataGrid
        containerStyle={{ height: "calc(100vh - 11rem)" }}
        rowData={rows}
        columnDefs={columnDefs}
        defaultColDef={{
          sortable: false,
          suppressHeaderMenuButton: true,
        }}
        getRowId={({ data }) => data.id}
      />
    </Container>
  );
}
