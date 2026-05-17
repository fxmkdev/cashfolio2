import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { Suspense, lazy } from "react";
import { getGainLossEquityAccountId } from "@/server/accounts";
import { getPeriodEndNetWorth } from "@/server/period-end-net-worth";
import { getOpeningBalanceNetWorthForPeriod } from "@/server/period-opening-balance-net-worth";
import { getPeriodOverview } from "@/server/period";
import { createDocumentTitleHead } from "@/shared/document-title";
import { formatMonthPeriodValue } from "@/shared/period";
import {
  buildNetWorthReconciliationModel,
  getPreviousPeriodValue,
  type NetWorthReconciliationModel,
} from "./-net-worth/-net-worth-reconciliation";
import { hasExplicitGainLossGroup } from "./-gains-losses/-gains-losses-explicit";
import {
  DEFAULT_PERIOD_VALUE,
  getPeriodValue,
  parsePeriodSearch,
} from "./-page-types";

const ReportPageView = lazy(async () => {
  const module = await import("./-page-view");
  return { default: module.ReportPageView };
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

export const Route = createFileRoute("/$accountBookId/report")({
  validateSearch: parsePeriodSearch,
  loaderDeps: ({ search }) => ({
    period: getPeriodValue(search),
  }),
  loader: async ({ params: { accountBookId }, deps: { period } }) => {
    const { getAuthenticatedUserLocale } =
      await import("@/server/user-profile");
    const userLocale = await getAuthenticatedUserLocale();
    const overview = await getPeriodOverview({
      data: {
        accountBookId,
        period,
        locale: userLocale,
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
  head: ({ loaderData }) =>
    createDocumentTitleHead(loaderData?.overview.selectedPeriodLabel),
  component: ReportLayout,
});

function ReportLayout() {
  return <Outlet />;
}

export function ReportPageContent() {
  const { accountBookId } = Route.useParams();
  const search = Route.useSearch();
  const selectedPeriodValue = getPeriodValue(search);
  const { overview, gainLossEquityAccountId, netWorthReconciliation } =
    Route.useLoaderData();
  const navigate = useNavigate({ from: "/$accountBookId/report" });
  const explicitLedgerPeriodValue = getSelectedExplicitPeriodValue({
    selectedGranularity: overview.selectedGranularity,
    selectedYear: overview.selectedYear,
    selectedMonth: overview.selectedMonth,
  });

  return (
    <Suspense fallback={null}>
      <ReportPageView
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
            to: "/$accountBookId/report/gains-losses/$accountId",
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
