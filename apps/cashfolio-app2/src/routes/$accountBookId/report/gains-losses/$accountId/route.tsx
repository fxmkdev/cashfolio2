import { useLedgerNavigationState } from "@/hooks/use-ledger-navigation-state";
import { createFileRoute } from "@tanstack/react-router";
import { Suspense, lazy } from "react";
import { getPeriodGainLossReconciliationPageData } from "@/server/period-gain-loss-reconciliation";
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
  "/$accountBookId/report/gains-losses/$accountId",
)({
  validateSearch: parsePeriodSearch,
  loaderDeps: ({ search }) => ({
    period: getPeriodValue(search),
  }),
  loader: async ({
    params: { accountBookId, accountId },
    deps: { period },
  }) => {
    const { getAuthenticatedUserLocale } =
      await import("@/server/user-profile");
    const userLocale = await getAuthenticatedUserLocale();
    return getPeriodGainLossReconciliationPageData({
      data: {
        accountBookId,
        accountId,
        period,
        locale: userLocale,
      },
    });
  },
  head: ({ loaderData }) =>
    createDocumentTitleHead(
      getGainLossReconciliationPageTitle(loaderData?.reconciliation),
    ),
  component: GainLossReconciliationPage,
});

function GainLossReconciliationPage() {
  const ledgerNavigationState = useLedgerNavigationState();
  const { accountBookId, accountId } = Route.useParams();
  const selectedPeriodValue = getPeriodValue(Route.useSearch());
  const pageData = Route.useLoaderData();
  const reconciliation = pageData.reconciliation;
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
        accountBookId={accountBookId}
        reportPeriodLabel={pageData.reportPeriodLabel}
        reportPeriodValue={pageData.reportPeriodValue}
        selectedPeriodValue={selectedPeriodValue}
        reconciliation={reconciliation}
        onPeriodChange={(nextPeriodValue) => {
          navigate({
            to: "/$accountBookId/report/gains-losses/$accountId",
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
            state: ledgerNavigationState,
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
