import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { Suspense, lazy } from "react";
import { getGainLossEquityAccountId } from "@/server/accounts";
import { getOpeningBalanceNetWorthForPeriod } from "@/server/period-opening-balance-net-worth";
import { getPeriodOverview } from "@/server/period";
import { formatMonthPeriodValue } from "@/shared/period";
import {
  buildNetWorthReconciliationModel,
  getPreviousPeriodValue,
  type NetWorthReconciliationModel,
} from "./-net-worth-reconciliation";
import { hasExplicitGainLossGroup } from "./-gains-losses-explicit";
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
    const gainLossEquityAccountId = hasExplicitGainLossGroup(
      overview.gainsLossesBreakdown.hierarchy,
    )
      ? await getGainLossEquityAccountId({
          data: {
            accountBookId,
          },
        })
      : null;
    const selectedExplicitPeriodValue =
      overview.selectedGranularity === "month" && overview.selectedMonth != null
        ? formatMonthPeriodValue(overview.selectedYear, overview.selectedMonth)
        : String(overview.selectedYear).padStart(4, "0");

    const minBookingDate = new Date(overview.minBookingDate);
    const previousPeriodValue = getPreviousPeriodValue({
      selectedGranularity: overview.selectedGranularity,
      selectedYear: overview.selectedYear,
      selectedMonth: overview.selectedMonth,
      minBookingDate,
    });

    let netWorthReconciliation: NetWorthReconciliationModel;
    if (previousPeriodValue) {
      const previousOverview = await getPeriodOverview({
        data: {
          accountBookId,
          period: previousPeriodValue,
        },
      });

      netWorthReconciliation = buildNetWorthReconciliationModel({
        baselineNetWorth: previousOverview.stats.endOfPeriodNetWorth,
        baselineSource: "previous-period",
        currentNetWorth: overview.stats.endOfPeriodNetWorth,
        totalReturn: overview.stats.totalReturn,
      });
    } else {
      const openingBalance = await getOpeningBalanceNetWorthForPeriod({
        data: {
          accountBookId,
          period: selectedExplicitPeriodValue,
        },
      });

      netWorthReconciliation = buildNetWorthReconciliationModel({
        baselineNetWorth: openingBalance.openingBalanceNetWorth,
        baselineSource: "opening-balance",
        currentNetWorth: overview.stats.endOfPeriodNetWorth,
        totalReturn: overview.stats.totalReturn,
      });
    }

    return { overview, gainLossEquityAccountId, netWorthReconciliation };
  },
  component: PeriodLayout,
});

function PeriodLayout() {
  return <Outlet />;
}

export function PeriodPageContent() {
  const { accountBookId } = Route.useParams();
  const search = Route.useSearch();
  const selectedPeriodValue = getPeriodValue(search);
  const { overview, gainLossEquityAccountId, netWorthReconciliation } =
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
        selectedPeriodValue={selectedPeriodValue}
        netWorthReconciliation={netWorthReconciliation}
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
        onGainLossUnitAccountDoubleClick={(accountId) =>
          navigate({
            to: "/$accountBookId/period/gains-losses/$accountId",
            params: { accountBookId, accountId },
            search: {
              period:
                selectedPeriodValue === DEFAULT_PERIOD_VALUE
                  ? undefined
                  : selectedPeriodValue,
            },
          })
        }
      />
    </Suspense>
  );
}
