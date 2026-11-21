import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { createDocumentTitleHead } from "@/shared/navigation/document-title";
import { readSecuritiesRouteSearch } from "@/shared/securities/route-search";
const SecuritiesPage = lazy(() =>
  import("./-page").then((module) => ({ default: module.SecuritiesPage })),
);
export const Route = createFileRoute("/$accountBookId/securities")({
  validateSearch: readSecuritiesRouteSearch,
  ssr: false,
  head: () => createDocumentTitleHead("Securities"),
  component: () => (
    <Suspense fallback={null}>
      <SecuritiesPage />
    </Suspense>
  ),
});
