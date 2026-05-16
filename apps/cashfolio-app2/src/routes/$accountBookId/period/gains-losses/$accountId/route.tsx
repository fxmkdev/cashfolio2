import { createFileRoute } from "@tanstack/react-router";
import { Suspense, lazy } from "react";
import { getPeriodGainLossReconciliation } from "@/server/period-gain-loss-reconciliation";
import { getAuthenticatedUserLocale } from "@/server/user-profile";
import { createDocumentTitleHead } from "@/shared/document-title";
import { formatMonthPeriodValue } from "@/shared/period";
import { DEFAULT_PERIOD_VALUE } from "../../-page-types";
import { getPeriodValue, parsePeriodSearch } from "../../-page-types";
import { getGainLossReconciliationPageTitle } from "./-page-title";

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
  loader: async ({
    params: { accountBookId, accountId },
    deps: { period },
  }) => {
    const userLocale = await getAuthenticatedUserLocale();
    return getPeriodGainLossReconciliation({
      data: {
        accountBookId,
        accountId,
        period,
        locale: userLocale,
      },
    });
  },
  head: ({ loaderData }) =>
    createDocumentTitleHead(getGainLossReconciliationPageTitle(loaderData)),
  component: GainLossReconciliationPage,
});

function GainLossReconciliationPage() {
  const { accountBookId, accountId } = Route.useParams();
  const selectedPeriodValue = getPeriodValue(Route.useSearch());
  const reconciliation = Route.useLoaderData();
  const navigate = Route.useNavigate();
  const explicitLedgerPeriodValue = reconciliation
    ? reconciliation.selectedGranularity === "month" &&
      reconciliation.selectedMonth != null
      ? formatMonthPeriodValue(
          reconciliation.selectedYear,
          reconciliation.selectedMonth,
        )
      : String(reconciliation.selectedYear).padStart(4, "0")
    : undefined;

  return (
    <Suspense fallback={null}>
      <GainLossReconciliationPageView
        selectedPeriodValue={selectedPeriodValue}
        reconciliation={reconciliation}
        onBackToPeriod={() => {
          const backPeriodValue =
            reconciliation?.selectedPeriodValue ?? selectedPeriodValue;
          navigate({
            to: "/$accountBookId/period",
            params: { accountBookId },
            search: {
              period:
                backPeriodValue === DEFAULT_PERIOD_VALUE
                  ? undefined
                  : backPeriodValue,
            },
          });
        }}
        onPeriodChange={(nextPeriodValue) => {
          navigate({
            to: "/$accountBookId/period/gains-losses/$accountId",
            params: { accountBookId, accountId },
            search: (previousSearch) => ({
              ...previousSearch,
              period:
                nextPeriodValue === DEFAULT_PERIOD_VALUE
                  ? undefined
                  : nextPeriodValue,
            }),
          });
        }}
        onOpenEventTransaction={(transactionId) => {
          if (!explicitLedgerPeriodValue) {
            return;
          }
          navigate({
            to: "/$accountBookId/$accountId",
            params: {
              accountBookId,
              accountId,
            },
            search: {
              period: explicitLedgerPeriodValue,
              transactionId,
            },
          });
        }}
      />
    </Suspense>
  );
}
