import { createFileRoute } from "@tanstack/react-router";
import { Suspense, lazy } from "react";
import { createDocumentTitleHead } from "@/shared/document-title";

const ValuationProviderUsagePageView = lazy(async () => {
  const module = await import("./-page-view");
  return { default: module.ValuationProviderUsagePageView };
});

export const Route = createFileRoute("/admin/valuation-provider-usage")({
  loader: async () => {
    const { getValuationProviderUsage } =
      await import("@/server/valuation-provider-usage");
    return getValuationProviderUsage();
  },
  head: () => createDocumentTitleHead("Provider Usage"),
  component: ValuationProviderUsagePage,
});

function ValuationProviderUsagePage() {
  const usage = Route.useLoaderData();

  return (
    <Suspense fallback={null}>
      <ValuationProviderUsagePageView usage={usage} />
    </Suspense>
  );
}
