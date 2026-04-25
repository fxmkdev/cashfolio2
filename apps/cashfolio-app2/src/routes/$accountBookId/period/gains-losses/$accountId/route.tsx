import { createFileRoute } from "@tanstack/react-router";
import { Suspense, lazy } from "react";
import { getPeriodGainLossReconciliation } from "@/server/period-gain-loss-reconciliation";
import { getPeriodValue, parsePeriodSearch } from "../../-page-types";

const GainLossReconciliationPageView = lazy(async () => {
  const module = await import("./-page-view");
  return { default: module.GainLossReconciliationPageView };
});

export const Route = createFileRoute(
  "/$accountBookId/period/gains-losses/$accountId",
)({
  validateSearch: parsePeriodSearch,
  loaderDeps: ({ search }) => ({
    period: getPeriodValue(search),
  }),
  loader: async ({ params: { accountBookId, accountId }, deps: { period } }) =>
    getPeriodGainLossReconciliation({
      data: {
        accountBookId,
        accountId,
        period,
      },
    }),
  component: GainLossReconciliationPage,
});

function GainLossReconciliationPage() {
  const { accountBookId } = Route.useParams();
  const selectedPeriodValue = getPeriodValue(Route.useSearch());
  const reconciliation = Route.useLoaderData();

  return (
    <Suspense fallback={null}>
      <GainLossReconciliationPageView
        accountBookId={accountBookId}
        selectedPeriodValue={selectedPeriodValue}
        reconciliation={reconciliation}
      />
    </Suspense>
  );
}
