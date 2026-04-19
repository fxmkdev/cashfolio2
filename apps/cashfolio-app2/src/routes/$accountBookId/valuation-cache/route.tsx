import { createFileRoute } from "@tanstack/react-router";
import { Suspense, lazy } from "react";
import { loadValuationCachePageData } from "./-page-loader";
import { getValuationUnitTab, parseValuationCacheSearch } from "./-page-types";

const ValuationCachePageView = lazy(async () => {
  const module = await import("./-page-view");
  return { default: module.ValuationCachePageView };
});

export const Route = createFileRoute("/$accountBookId/valuation-cache")({
  validateSearch: parseValuationCacheSearch,
  loader: async ({ params: { accountBookId } }) => {
    return loadValuationCachePageData({ accountBookId });
  },
  component: ValuationCachePage,
});

function ValuationCachePage() {
  const { accountBookId } = Route.useParams();
  const selectedTab = getValuationUnitTab(Route.useSearch());
  const units = Route.useLoaderData();

  return (
    <Suspense fallback={null}>
      <ValuationCachePageView
        accountBookId={accountBookId}
        selectedTab={selectedTab}
        units={units}
      />
    </Suspense>
  );
}
