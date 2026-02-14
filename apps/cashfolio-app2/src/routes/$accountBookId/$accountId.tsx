import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useMemo, useRef } from "react";
import { Anchor, Badge, Container, Group, Title } from "@mantine/core";
import { IconArrowLeft } from "@tabler/icons-react";
import type {
  ColDef,
  ICellRendererParams,
  RowDataUpdatedEvent,
} from "ag-grid-enterprise";
import { DataGrid } from "../../components/data-grid";
import { getAccountForLedger, getLedgerData } from "../../server/ledger";
import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../../.prisma-client/enums";

export const Route = createFileRoute("/$accountBookId/$accountId")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { transactionId?: string } => ({
    transactionId:
      typeof search.transactionId === "string"
        ? search.transactionId
        : undefined,
  }),
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
  transactionId: string;
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
  const { transactionId } = Route.useSearch();

  const rows = useMemo<LedgerRow[]>(() => {
    const negate = shouldNegate(account.type, account.equityAccountSubtype);
    let balance = 0;

    return bookings
      .map((b) => {
        const rawValue = Number(b.value);
        const value = negate ? -rawValue : rawValue;
        balance += value;

        return {
          id: b.id,
          transactionId: b.transactionId,
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
      })
      .reverse();
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
          data,
        }: ICellRendererParams<
          LedgerRow,
          LedgerRow["counterpartyAccounts"]
        >) => {
          if (!value || !data) return null;
          return value.map((a, i) => (
            <span key={a.id}>
              {i > 0 && ", "}
              <Link
                to="/$accountBookId/$accountId"
                params={{ accountBookId, accountId: a.id }}
                search={{ transactionId: data.transactionId }}
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

  const scrollTargetRef = useRef(transactionId);
  scrollTargetRef.current = transactionId;

  const handleRowDataUpdated = useCallback(
    (event: RowDataUpdatedEvent<LedgerRow>) => {
      const targetTxId = scrollTargetRef.current;
      if (!targetTxId) return;
      scrollTargetRef.current = undefined;

      const matchingIds = rows
        .filter((r) => r.transactionId === targetTxId)
        .map((r) => r.id);
      if (matchingIds.length === 0) return;

      const rowNodes = matchingIds
        .map((id) => event.api.getRowNode(id))
        .filter((n): n is NonNullable<typeof n> => !!n);
      if (rowNodes.length === 0) return;

      event.api.ensureNodeVisible(rowNodes[0]!, "middle");
      event.api.flashCells({ rowNodes });
    },
    [rows],
  );

  const unitLabel = getUnitLabel(account);

  const backTab = (
    account.type === AccountType.EQUITY && account.equityAccountSubtype
      ? `EQUITY-${account.equityAccountSubtype}`
      : account.type
  ) as "ASSET" | "LIABILITY" | `EQUITY-${EquityAccountSubtype}`;

  return (
    <Container fluid py="xl" px="xl">
      <Group mb="lg" gap="md">
        <Link
          to="/$accountBookId"
          params={{ accountBookId }}
          search={{ tab: backTab }}
        >
          <IconArrowLeft size={20} />
        </Link>
        <Title order={2}>
          {account.groupPath} / {account.name}
        </Title>
        {unitLabel && (
          <Badge size="lg" color="gray">
            {unitLabel}
          </Badge>
        )}
      </Group>

      <DataGrid
        containerStyle={{ height: "calc(100vh - 8rem)" }}
        rowData={rows}
        columnDefs={columnDefs}
        defaultColDef={{
          sortable: false,
          suppressHeaderMenuButton: true,
        }}
        getRowId={({ data }) => data.id}
        onRowDataUpdated={handleRowDataUpdated}
      />
    </Container>
  );
}
