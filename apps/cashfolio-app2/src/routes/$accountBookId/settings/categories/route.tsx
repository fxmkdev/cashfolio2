import { useLedgerNavigationState } from "@/hooks/use-ledger-navigation-state";
import {
  createFileRoute,
  redirect,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { createDocumentTitleHead } from "@/shared/document-title";
import { getAccountsPageTitle } from "@/components/account-management/types";
import {
  parseCategoriesSearch,
  getCategoriesRedirect,
} from "@/shared/account-management-search";
import { loadAccountsPageData } from "@/components/account-management/loading/loader";
import { useAccountsPageController } from "@/components/account-management/controller";

const AccountsPageView = lazy(async () => {
  const module = await import("@/components/account-management/view");
  return { default: module.AccountsPageView };
});

export const Route = createFileRoute("/$accountBookId/settings/categories")({
  validateSearch: parseCategoriesSearch,
  loaderDeps: ({ search }) => ({
    tab: search.tab,
  }),
  beforeLoad: ({ location, params, search }) => {
    if (
      new URLSearchParams(location.searchStr).has("mode") ||
      new URLSearchParams(location.searchStr).has("organize")
    ) {
      throw redirect({ ...getCategoriesRedirect(search), params });
    }
  },
  loader: async ({ params: { accountBookId }, deps: { tab } }) => {
    const pageData = await loadAccountsPageData({
      accountBookId,
      showArchived: true,
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
  const ledgerNavigationState = useLedgerNavigationState();
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
        state: ledgerNavigationState,
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
