import {
  createFileRoute,
  redirect,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { Suspense, lazy } from "react";
import { createDocumentTitleHead } from "@/shared/document-title";
import { getAccountsPageTitle, parseAccountsSearch } from "./-page-types";
import { loadAccountsPageData } from "./-page-loader";
import { useAccountsPageController } from "./-page-controller";

const AccountsPageView = lazy(async () => {
  const module = await import("./-page-view");
  return { default: module.AccountsPageView };
});

export const Route = createFileRoute("/$accountBookId/accounts")({
  validateSearch: parseAccountsSearch,
  loaderDeps: ({ search }) => ({ mode: search.mode, tab: search.tab }),
  beforeLoad: ({ params, search, location }) => {
    if (search.tab === "EQUITY-INCOME" || search.tab === "EQUITY-EXPENSE") {
      throw redirect({
        to: "/$accountBookId/settings/categories",
        params,
        search,
        replace: true,
      });
    }
    if (new URLSearchParams(location.searchStr).get("mode") === "archived") {
      throw redirect({
        to: "/$accountBookId/accounts",
        params,
        search: { tab: search.tab, mode: "active" },
        replace: true,
      });
    }
  },

  loader: async ({ params: { accountBookId }, deps: { mode, tab } }) => {
    const pageData = await loadAccountsPageData({ accountBookId, mode, tab });
    return { ...pageData, documentTitle: getAccountsPageTitle(mode) };
  },
  head: ({ loaderData }) => createDocumentTitleHead(loaderData?.documentTitle),
  component: AccountsPage,
});

function AccountsPage() {
  const loaderData = Route.useLoaderData();
  const { accountBookId } = Route.useParams();
  const { tab, mode } = Route.useSearch();
  const navigate = useNavigate({ from: "/$accountBookId/accounts" });
  const router = useRouter();

  const viewProps = useAccountsPageController({
    loaderData,
    accountBookId,
    tab,
    mode,
    invalidate: () => {
      router.invalidate();
    },
    onOpenLedger: (nextAccountId) => {
      navigate({
        to: "/$accountBookId/$accountId",
        params: { accountBookId, accountId: nextAccountId },
      });
    },
  });

  return (
    <Suspense fallback={null}>
      <AccountsPageView {...viewProps} />
    </Suspense>
  );
}
