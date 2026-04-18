import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Suspense, lazy } from "react";
import { getPeriodOverview } from "../../server/period";
import {
  DEFAULT_PERIOD_VALUE,
  getPeriodValue,
  parsePeriodSearch,
} from "./-period-page-types";

const PeriodPageView = lazy(async () => {
  const module = await import("./-period-page-view");
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
  const selectedPeriodValue = getPeriodValue(Route.useSearch());
  const overview = Route.useLoaderData();
  const navigate = useNavigate({ from: "/$accountBookId/period" });

  return (
    <Suspense fallback={null}>
      <PeriodPageView
        accountBookId={accountBookId}
        overview={overview}
        selectedPeriodValue={selectedPeriodValue}
        onPeriodChange={(nextPeriodValue) =>
          navigate({
            search: () =>
              nextPeriodValue === DEFAULT_PERIOD_VALUE
                ? {}
                : { period: nextPeriodValue },
          })
        }
      />
    </Suspense>
  );
}
