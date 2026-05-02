import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { Suspense, lazy } from "react";
import { getGainLossEquityAccountId } from "@/server/accounts";
import { getPeriodEndNetWorth } from "@/server/period-end-net-worth";
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

function getSelectedExplicitPeriodValue(args: {
  selectedGranularity: "month" | "year";
  selectedYear: number;
  selectedMonth: number | null;
}): string {
  return args.selectedGranularity === "month" && args.selectedMonth != null
    ? formatMonthPeriodValue(args.selectedYear, args.selectedMonth)
    : String(args.selectedYear).padStart(4, "0");
}

async function loadNetWorthReconciliationModel(args: {
  accountBookId: string;
  selectedGranularity: "month" | "year";
  selectedYear: number;
  selectedMonth: number | null;
  minBookingDate: string;
  currentNetWorth: number;
  totalReturn: number;
}): Promise<NetWorthReconciliationModel> {
  const minBookingDate = new Date(args.minBookingDate);
  const previousPeriodValue = getPreviousPeriodValue({
    selectedGranularity: args.selectedGranularity,
    selectedYear: args.selectedYear,
    selectedMonth: args.selectedMonth,
    minBookingDate,
  });

  if (previousPeriodValue) {
    const previousPeriodNetWorth = await getPeriodEndNetWorth({
      data: {
        accountBookId: args.accountBookId,
        period: previousPeriodValue,
      },
    });

    return buildNetWorthReconciliationModel({
      baselineNetWorth: previousPeriodNetWorth.endOfPeriodNetWorth,
      baselineSource: "previous-period",
      currentNetWorth: args.currentNetWorth,
      totalReturn: args.totalReturn,
    });
  }

  const selectedExplicitPeriodValue = getSelectedExplicitPeriodValue({
    selectedGranularity: args.selectedGranularity,
    selectedYear: args.selectedYear,
    selectedMonth: args.selectedMonth,
  });
  const openingBalance = await getOpeningBalanceNetWorthForPeriod({
    data: {
      accountBookId: args.accountBookId,
      period: selectedExplicitPeriodValue,
    },
  });

  return buildNetWorthReconciliationModel({
    baselineNetWorth: openingBalance.openingBalanceNetWorth,
    baselineSource: "opening-balance",
    currentNetWorth: args.currentNetWorth,
    totalReturn: args.totalReturn,
  });
}

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
    const [gainLossEquityAccountId, netWorthReconciliation] = await Promise.all(
      [
        hasExplicitGainLossGroup(overview.gainsLossesBreakdown.hierarchy)
          ? getGainLossEquityAccountId({
              data: {
                accountBookId,
              },
            })
          : Promise.resolve<string | null>(null),
        loadNetWorthReconciliationModel({
          accountBookId,
          selectedGranularity: overview.selectedGranularity,
          selectedYear: overview.selectedYear,
          selectedMonth: overview.selectedMonth,
          minBookingDate: overview.minBookingDate,
          currentNetWorth: overview.stats.endOfPeriodNetWorth,
          totalReturn: overview.stats.totalReturn,
        }),
      ],
    );

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
  const explicitLedgerPeriodValue = getSelectedExplicitPeriodValue({
    selectedGranularity: overview.selectedGranularity,
    selectedYear: overview.selectedYear,
    selectedMonth: overview.selectedMonth,
  });

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
