import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { AccountType } from "@/.prisma-client/enums";
import { getLedgerReferenceBalanceChartData } from "@/server/ledger";
import {
  buildLedgerBalanceChartPoints,
  createLedgerBalanceFormatter,
  getUnitLabel,
} from "../-page-data";
import { Route as LedgerLayoutRoute } from "../route";
import { LedgerBalanceChartPageView } from "./-page-view";
import { LedgerViewSegmentedControl } from "../-view-segmented-control";

export const Route = createFileRoute("/$accountBookId/$accountId/chart")({
  loader: async ({ params: { accountBookId, accountId } }) =>
    getLedgerReferenceBalanceChartData({
      data: { accountBookId, accountId },
    }),
  component: LedgerChartPage,
});

function LedgerChartPage() {
  const { accountBookId, accountId } = LedgerLayoutRoute.useParams();
  const { account, bookings } = LedgerLayoutRoute.useLoaderData();
  const chartData = Route.useLoaderData();

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

  const convertedBookingValueById = useMemo(
    () =>
      new Map(
        chartData.convertedBookingValues.map((entry) => [
          entry.bookingId,
          entry.convertedValue,
        ]),
      ),
    [chartData.convertedBookingValues],
  );

  const points = useMemo(
    () =>
      buildLedgerBalanceChartPoints(
        account,
        bookings,
        new Date(),
        convertedBookingValueById,
      ),
    [account, bookings, convertedBookingValueById],
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
  const formatBalanceInReferenceCurrency = useMemo(() => {
    const formatter = new Intl.NumberFormat("en-CH", {
      style: "currency",
      currency: chartData.referenceCurrency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    return (value: number) => formatter.format(value);
  }, [chartData.referenceCurrency]);

  const backTab = account.type;

  return (
    <LedgerBalanceChartPageView
      accountBookId={accountBookId}
      backTab={backTab}
      account={account}
      unitLabel={getUnitLabel(account)}
      points={points}
      formatBalance={formatBalance}
      referenceCurrency={chartData.referenceCurrency}
      formatBalanceInReferenceCurrency={formatBalanceInReferenceCurrency}
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
