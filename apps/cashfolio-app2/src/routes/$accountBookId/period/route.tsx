import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Suspense, lazy } from "react";
import { getGainLossEquityAccountId } from "@/server/accounts";
import { getPeriodOverview } from "@/server/period";
import { formatMonthPeriodValue } from "@/shared/period";
import { hasExplicitGainLossGroup } from "./-gains-losses-explicit";
import {
  buildNetWorthTrendWindow,
  buildPeriodNetWorthTrendPoints,
} from "./-net-worth-trend";
import {
  DEFAULT_PERIOD_VALUE,
  getPeriodValue,
  parsePeriodSearch,
} from "./-page-types";

const PeriodPageView = lazy(async () => {
  const module = await import("./-page-view");
  return { default: module.PeriodPageView };
});

export const Route = createFileRoute("/$accountBookId/period")({
  validateSearch: parsePeriodSearch,
  loaderDeps: ({ search }) => ({
    period: getPeriodValue(search),
  }),
  loader: async ({ params: { accountBookId }, deps: { period } }) => {
    const overview = await getPeriodOverview({
      data: {
        accountBookId,
        period,
      },
    });
    const trendWindow = buildNetWorthTrendWindow({
      selectedGranularity: overview.selectedGranularity,
      selectedYear: overview.selectedYear,
      selectedMonth: overview.selectedMonth,
      minBookingDate: overview.minBookingDate
        ? new Date(overview.minBookingDate)
        : null,
    });
    const priorNetWorthEntries = await Promise.all(
      trendWindow
        .filter((point) => point.isInRange && !point.isSelected)
        .map(async (point) => {
          const periodOverview = await getPeriodOverview({
            data: {
              accountBookId,
              period: point.periodValue,
            },
          });
          return [
            point.periodValue,
            periodOverview.stats.endOfPeriodNetWorth,
          ] as const;
        }),
    );
    const netWorthTrend = buildPeriodNetWorthTrendPoints({
      window: trendWindow,
      selectedNetWorth: overview.stats.endOfPeriodNetWorth,
      netWorthByPeriodValue: new Map(priorNetWorthEntries),
    });

    const gainLossEquityAccountId = hasExplicitGainLossGroup(
      overview.gainsLossesBreakdown.hierarchy,
    )
      ? await getGainLossEquityAccountId({
          data: {
            accountBookId,
          },
        })
      : null;

    return { overview, gainLossEquityAccountId, netWorthTrend };
  },
  component: PeriodPage,
});

function PeriodPage() {
  const { accountBookId } = Route.useParams();
  const search = Route.useSearch();
  const selectedPeriodValue = getPeriodValue(search);
  const { overview, gainLossEquityAccountId, netWorthTrend } =
    Route.useLoaderData();
  const navigate = useNavigate({ from: "/$accountBookId/period" });
  const explicitLedgerPeriodValue =
    overview.selectedGranularity === "month" && overview.selectedMonth != null
      ? formatMonthPeriodValue(overview.selectedYear, overview.selectedMonth)
      : String(overview.selectedYear).padStart(4, "0");

  return (
    <Suspense fallback={null}>
      <PeriodPageView
        accountBookId={accountBookId}
        overview={overview}
        netWorthTrend={netWorthTrend}
        selectedPeriodValue={selectedPeriodValue}
        onPeriodChange={(nextPeriodValue) =>
          navigate({
            search: (previousSearch) => ({
              ...previousSearch,
              period:
                nextPeriodValue === DEFAULT_PERIOD_VALUE
                  ? undefined
                  : nextPeriodValue,
            }),
          })
        }
        onBreakdownAccountDoubleClick={(accountId) =>
          navigate({
            to: "/$accountBookId/$accountId",
            params: { accountBookId, accountId },
            search: {
              period: explicitLedgerPeriodValue,
            },
          })
        }
        onExplicitGainLossDoubleClick={() => {
          if (!gainLossEquityAccountId) {
            return;
          }

          navigate({
            to: "/$accountBookId/$accountId",
            params: { accountBookId, accountId: gainLossEquityAccountId },
            search: {
              period: explicitLedgerPeriodValue,
            },
          });
        }}
      />
    </Suspense>
  );
}
