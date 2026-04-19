import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Suspense, lazy } from "react";
import { getDashboardIncomeExpenseOverview } from "../../../server/dashboard";
import {
  DASHBOARD_PERIOD_10Y,
  getDashboardPeriod,
  parseDashboardSearch,
  type DashboardPeriod,
} from "./-page-types";

const DashboardPageView = lazy(async () => {
  const module = await import("./-page-view");
  return { default: module.DashboardPageView };
});

export const Route = createFileRoute("/$accountBookId/dashboard")({
  validateSearch: parseDashboardSearch,
  loaderDeps: ({ search }) => ({
    period: getDashboardPeriod(search),
  }),
  loader: async ({ params: { accountBookId }, deps: { period } }) => {
    return getDashboardIncomeExpenseOverview({
      data: { accountBookId, period },
    });
  },
  component: DashboardPage,
});

function DashboardPage() {
  const { accountBookId } = Route.useParams();
  const selectedPeriod = getDashboardPeriod(Route.useSearch());
  const overview = Route.useLoaderData();
  const navigate = useNavigate({ from: "/$accountBookId/dashboard" });

  return (
    <Suspense fallback={null}>
      <DashboardPageView
        accountBookId={accountBookId}
        overview={overview}
        selectedPeriod={selectedPeriod}
        onPeriodChange={(nextPeriod: DashboardPeriod) =>
          navigate({
            search: () =>
              nextPeriod === DASHBOARD_PERIOD_10Y
                ? { period: DASHBOARD_PERIOD_10Y }
                : {},
          })
        }
      />
    </Suspense>
  );
}
