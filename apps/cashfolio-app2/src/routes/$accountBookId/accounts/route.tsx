import { useLedgerNavigationState } from "@/hooks/use-ledger-navigation-state";
import {
  createFileRoute,
  redirect,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { Suspense, lazy } from "react";
import { createDocumentTitleHead } from "@/shared/navigation/document-title";
import { getAccountsPageTitle } from "@/components/account-management/labels";
import {
  parseAccountsSearch,
  getCategoriesRedirect,
  getCanonicalAccountsSearch,
} from "@/shared/accounts/account-management-search";
import { loadAccountsPageData } from "@/components/account-management/loading/loader";
import { useAccountsPageController } from "@/components/account-management/controller";
import { AccountReturnDrawer } from "@/components/account-returns/return-drawer";

const AccountsPageView = lazy(async () => {
  const module = await import("@/components/account-management/view");
  return { default: module.AccountsPageView };
});

export const Route = createFileRoute("/$accountBookId/accounts")({
  validateSearch: parseAccountsSearch,
  loaderDeps: ({ search }) => ({ mode: search.mode, tab: search.tab }),
  beforeLoad: ({ params, search, location }) => {
    if (search.tab === "EQUITY-INCOME" || search.tab === "EQUITY-EXPENSE") {
      throw redirect({
        ...getCategoriesRedirect(search),
        params,
      });
    }
    const canonicalSearch = getCanonicalAccountsSearch(
      location.searchStr,
      search,
    );
    if (canonicalSearch) {
      throw redirect({
        to: "/$accountBookId/accounts",
        params,
        search: canonicalSearch,
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
  const ledgerNavigationState = useLedgerNavigationState();
  const loaderData = Route.useLoaderData();
  const { accountBookId } = Route.useParams();
  const { tab, mode, grouping, organize } = Route.useSearch();
  const navigate = useNavigate({ from: "/$accountBookId/accounts" });
  const router = useRouter();

  const viewProps = useAccountsPageController({
    loaderData,
    accountBookId,
    tab,
    mode,
    grouping,
    organize,
    onGroupingChange: (grouping) =>
      void navigate({ search: (previous) => ({ ...previous, grouping }) }),
    invalidate: () => {
      router.invalidate();
    },
    onOpenLedger: (nextAccountId) => {
      navigate({
        to: "/$accountBookId/$accountId",
        state: ledgerNavigationState,
        params: { accountBookId, accountId: nextAccountId },
      });
    },
  });

  return (
    <Suspense fallback={null}>
      <AccountsPageView {...viewProps} />
      {viewProps.returnCalculation ? (
        <AccountReturnDrawer
          accountBookId={accountBookId}
          accountState="all"
          grouping={grouping ?? "accountStructure"}
          {...viewProps.returnCalculation}
          onOpenTransaction={(transactionId, date) =>
            void navigate({
              to: "/$accountBookId/transactions",
              params: { accountBookId },
              search: { transactionId, period: date.slice(0, 7) },
            })
          }
        />
      ) : null}
    </Suspense>
  );
}
