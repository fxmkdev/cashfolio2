import {
  createFileRoute,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { createDocumentTitleHead } from "@/shared/document-title";
import {
  getAccountsPageTitle,
  parseCategoriesSearch,
} from "../../accounts/-page-types";
import { loadAccountsPageData } from "../../accounts/-page-loader";
import { useAccountsPageController } from "../../accounts/-page-controller";

const AccountsPageView = lazy(async () => {
  const module = await import("../../accounts/-page-view");
  return { default: module.AccountsPageView };
});

export const Route = createFileRoute("/$accountBookId/settings/categories")({
  validateSearch: parseCategoriesSearch,
  loaderDeps: ({ search }) => ({ mode: search.mode, tab: search.tab }),
  loader: async ({ params: { accountBookId }, deps: { mode, tab } }) => {
    const pageData = await loadAccountsPageData({ accountBookId, mode, tab });
    return {
      ...pageData,
      documentTitle: getAccountsPageTitle(mode, "categories"),
    };
  },
  head: ({ loaderData }) => createDocumentTitleHead(loaderData?.documentTitle),
  component: CategoriesPage,
});

function CategoriesPage() {
  const loaderData = Route.useLoaderData();
  const { accountBookId } = Route.useParams();
  const { tab, mode } = Route.useSearch();
  const navigate = useNavigate({ from: "/$accountBookId/settings/categories" });
  const router = useRouter();
  const viewProps = useAccountsPageController({
    managementContext: "categories",
    loaderData,
    accountBookId,
    tab,
    mode,
    invalidate: () => {
      void router.invalidate();
    },
    onOpenLedger: (accountId) => {
      void navigate({
        to: "/$accountBookId/$accountId",
        params: { accountBookId, accountId },
      });
    },
  });
  return (
    <Suspense fallback={null}>
      <AccountsPageView {...viewProps} />
    </Suspense>
  );
}
