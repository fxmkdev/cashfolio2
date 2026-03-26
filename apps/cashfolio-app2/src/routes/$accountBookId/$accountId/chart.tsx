import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  AccountType,
  EquityAccountSubtype,
} from "../../../.prisma-client/enums";
import {
  buildLedgerBalanceChartPoints,
  createLedgerBalanceFormatter,
  getUnitLabel,
} from "../-ledger-page-data";
import { loadLedgerPageData } from "../-ledger-page-loader";
import { LedgerBalanceChartPageView } from "../-ledger-balance-chart-page-view";
import { LedgerViewSegmentedControl } from "../-ledger-view-segmented-control";

export const Route = createFileRoute("/$accountBookId/$accountId/chart")({
  loader: async ({ params: { accountBookId, accountId } }) => {
    const data = await loadLedgerPageData({ accountBookId, accountId });

    if (
      data.account.type !== AccountType.ASSET &&
      data.account.type !== AccountType.LIABILITY
    ) {
      throw redirect({
        to: "/$accountBookId/$accountId",
        params: { accountBookId, accountId },
      });
    }

    return data;
  },
  component: LedgerChartPage,
});

function LedgerChartPage() {
  const { accountBookId, accountId } = Route.useParams();
  const { account, bookings } = Route.useLoaderData();

  const points = useMemo(
    () => buildLedgerBalanceChartPoints(account, bookings),
    [account, bookings],
  );

  const formatBalance = useMemo(
    () => createLedgerBalanceFormatter(account),
    [
      account.currency,
      account.cryptocurrency,
      account.tradeCurrency,
      account.unit,
    ],
  );

  const backTab = (
    account.type === AccountType.EQUITY && account.equityAccountSubtype
      ? `EQUITY-${account.equityAccountSubtype}`
      : account.type
  ) as "ASSET" | "LIABILITY" | `EQUITY-${EquityAccountSubtype}`;

  return (
    <LedgerBalanceChartPageView
      accountBookId={accountBookId}
      backTab={backTab}
      account={account}
      unitLabel={getUnitLabel(account)}
      points={points}
      formatBalance={formatBalance}
      viewSwitcher={
        <LedgerViewSegmentedControl
          accountBookId={accountBookId}
          accountId={accountId}
          view="chart"
        />
      }
    />
  );
}
