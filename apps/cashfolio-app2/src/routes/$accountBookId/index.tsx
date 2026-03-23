import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { getDashboardIncomeExpenseOverview } from "../../server/dashboard";
import { DashboardPageView } from "./dashboard-page-view";

export const Route = createFileRoute("/$accountBookId/")({
  loader: async ({ params: { accountBookId } }) => {
    return getDashboardIncomeExpenseOverview({ data: { accountBookId } });
  },
  component: DashboardPage,
});

function DashboardPage() {
  const { accountBookId } = Route.useParams();
  const overview = Route.useLoaderData();
  const navigate = useNavigate({ from: "/$accountBookId/" });

  return (
    <DashboardPageView
      overview={overview}
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
