import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Suspense, lazy } from "react";
import { getPeriodOverview } from "@/server/period";
import { formatMonthPeriodValue } from "@/shared/period";
import {
  DEFAULT_PERIOD_VALUE,
  formatBreakdownPathSearchValue,
  getAllocationBreakdownPathByType,
  getBreakdownPathByType,
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
    return getPeriodOverview({
      data: {
        accountBookId,
        period,
      },
    });
  },
  component: PeriodPage,
});

function PeriodPage() {
  const { accountBookId } = Route.useParams();
  const search = Route.useSearch();
  const selectedPeriodValue = getPeriodValue(search);
  const drillPathByBreakdown = getBreakdownPathByType(search);
  const drillPathByAllocationBreakdown =
    getAllocationBreakdownPathByType(search);
  const overview = Route.useLoaderData();
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
        drillPathByBreakdown={drillPathByBreakdown}
        drillPathByAllocationBreakdown={drillPathByAllocationBreakdown}
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
        onDrillPathByBreakdownChange={(nextPathByBreakdown) =>
          navigate({
            search: (previousSearch) => ({
              ...previousSearch,
              expensePath: formatBreakdownPathSearchValue(
                nextPathByBreakdown.expense,
              ),
              incomePath: formatBreakdownPathSearchValue(
                nextPathByBreakdown.income,
              ),
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
        onDrillPathByAllocationBreakdownChange={(nextPathByBreakdown) =>
          navigate({
            search: (previousSearch) => ({
              ...previousSearch,
              assetPath: formatBreakdownPathSearchValue(
                nextPathByBreakdown.asset,
              ),
              liabilityPath: formatBreakdownPathSearchValue(
                nextPathByBreakdown.liability,
              ),
            }),
          })
        }
      />
    </Suspense>
  );
}
