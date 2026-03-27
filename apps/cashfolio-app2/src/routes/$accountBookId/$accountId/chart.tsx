import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { AccountType } from "../../../.prisma-client/enums";
import {
  buildLedgerBalanceChartPoints,
  createLedgerBalanceFormatter,
  getUnitLabel,
} from "../-ledger-page-data";
import { Route as LedgerLayoutRoute } from "../$accountId";
import { LedgerBalanceChartPageView } from "../-ledger-balance-chart-page-view";
import { LedgerViewSegmentedControl } from "../-ledger-view-segmented-control";

export const Route = createFileRoute("/$accountBookId/$accountId/chart")({
  component: LedgerChartPage,
});

function LedgerChartPage() {
  const { accountBookId, accountId } = LedgerLayoutRoute.useParams();
  const { account, bookings } = LedgerLayoutRoute.useLoaderData();

  if (
    account.type !== AccountType.ASSET &&
    account.type !== AccountType.LIABILITY
  ) {
    return (
      <Navigate
        to="/$accountBookId/$accountId"
        params={{ accountBookId, accountId }}
        replace
      />
    );
  }

  const points = useMemo(
    () => buildLedgerBalanceChartPoints(account, bookings),
    [account, bookings],
  );

  const formatBalance = useMemo(
    () => createLedgerBalanceFormatter(account),
    [
      account.currency,
      account.cryptocurrency,
      account.symbol,
      account.tradeCurrency,
      account.unit,
    ],
  );

  const backTab = account.type;

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
