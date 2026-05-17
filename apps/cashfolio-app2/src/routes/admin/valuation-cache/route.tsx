import { createFileRoute } from "@tanstack/react-router";
import { Suspense, lazy } from "react";
import { createDocumentTitleHead } from "@/shared/document-title";
import { loadValuationCachePageData } from "./-page-loader";
import { getValuationUnitTab, parseValuationCacheSearch } from "./-page-types";

const ValuationCachePageView = lazy(async () => {
  const module = await import("./-page-view");
  return { default: module.ValuationCachePageView };
});

export const Route = createFileRoute("/admin/valuation-cache")({
  validateSearch: parseValuationCacheSearch,
  loader: async () => {
    return loadValuationCachePageData();
  },
  head: () => createDocumentTitleHead("Valuation Cache"),
  component: ValuationCachePage,
});

function ValuationCachePage() {
  const selectedTab = getValuationUnitTab(Route.useSearch());
  const units = Route.useLoaderData();

  return (
    <Suspense fallback={null}>
      <ValuationCachePageView selectedTab={selectedTab} units={units} />
    </Suspense>
  );
}
