import {
  createFileRoute,
  redirect,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { createDocumentTitleHead } from "@/shared/document-title";
import {
  getAccountsPageTitle,
  parseCategoriesSearch,
  getCategoriesRedirect,
} from "../../accounts/-page-types";
import { loadAccountsPageData } from "../../accounts/-page-loader";
import { useAccountsPageController } from "../../accounts/-page-controller";

const AccountsPageView = lazy(async () => {
  const module = await import("../../accounts/-page-view");
  return { default: module.AccountsPageView };
});

export const Route = createFileRoute("/$accountBookId/settings/categories")({
  validateSearch: parseCategoriesSearch,
  loaderDeps: ({ search }) => ({
    showArchived: search.showArchived,
    tab: search.tab,
  }),
  beforeLoad: ({ location, params, search }) => {
    if (new URLSearchParams(location.searchStr).has("mode")) {
      throw redirect({ ...getCategoriesRedirect(search), params });
    }
  },
  loader: async ({
    params: { accountBookId },
    deps: { showArchived, tab },
  }) => {
    const pageData = await loadAccountsPageData({
      accountBookId,
      showArchived,
      tab,
    });
    return {
      ...pageData,
      documentTitle: getAccountsPageTitle(undefined, "categories"),
    };
  },
  head: ({ loaderData }) => createDocumentTitleHead(loaderData?.documentTitle),
  component: CategoriesPage,
});

function CategoriesPage() {
  const loaderData = Route.useLoaderData();
  const { accountBookId } = Route.useParams();
  const { tab, showArchived } = Route.useSearch();
  const navigate = useNavigate({ from: "/$accountBookId/settings/categories" });
  const router = useRouter();
  const viewProps = useAccountsPageController({
    managementContext: "categories",
    loaderData,
    accountBookId,
    tab,
    showArchived,
    onShowArchivedChange: (nextShowArchived) => {
      void navigate({ search: { tab, showArchived: nextShowArchived } });
    },
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
