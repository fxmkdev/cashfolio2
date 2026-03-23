import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { getDashboardIncomeExpenseOverview } from "../../server/dashboard";
import { DashboardPageView } from "./dashboard-page-view";
import {
  DASHBOARD_PERIOD_10Y,
  getDashboardPeriod,
  parseDashboardSearch,
  type DashboardPeriod,
} from "./dashboard-page-types";

export const Route = createFileRoute("/$accountBookId/")({
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
  const navigate = useNavigate({ from: "/$accountBookId/" });

  return (
    <DashboardPageView
      overview={overview}
      selectedPeriod={selectedPeriod}
      onPeriodChange={(nextPeriod: DashboardPeriod) =>
        navigate({
          search:
            nextPeriod === DASHBOARD_PERIOD_10Y
              ? { period: DASHBOARD_PERIOD_10Y }
              : { period: undefined },
        })
      }
      onNavigateToAccounts={() =>
        navigate({
          to: "/$accountBookId/accounts",
          params: { accountBookId },
          search: {
            tab: "ASSET",
            mode: "active",
          },
        })
      }
    />
  );
}
