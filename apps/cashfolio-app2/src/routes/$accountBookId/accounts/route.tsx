import {
  createFileRoute,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { Suspense, lazy } from "react";
import { getUserAccountBooks, type UserAccountBookOption } from "@/server/home";
import { parseAccountsSearch } from "./-page-types";
import { loadAccountsPageData } from "./-page-loader";
import { useAccountsPageController } from "./-page-controller";

const AccountsPageView = lazy(async () => {
  const module = await import("./-page-view");
  return { default: module.AccountsPageView };
});

let cachedAccountBooksPromise: Promise<UserAccountBookOption[]> | null = null;

function loadUserAccountBooksForRoute() {
  if (typeof window === "undefined") {
    return getUserAccountBooks();
  }

  if (!cachedAccountBooksPromise) {
    cachedAccountBooksPromise = getUserAccountBooks();
  }

  return cachedAccountBooksPromise;
}

export const Route = createFileRoute("/$accountBookId/accounts")({
  validateSearch: parseAccountsSearch,
  loaderDeps: ({ search }) => ({ mode: search.mode, tab: search.tab }),
  loader: async ({ params: { accountBookId }, deps: { mode, tab } }) => {
    const [accountsPageData, accountBooks] = await Promise.all([
      loadAccountsPageData({ accountBookId, mode, tab }),
      loadUserAccountBooksForRoute(),
    ]);

    return {
      ...accountsPageData,
      accountBooks,
    };
  },
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
      <AccountsPageView
        {...viewProps}
        accountBooks={loaderData.accountBooks}
        onSelectAccountBook={(nextAccountBookId) => {
          if (nextAccountBookId === accountBookId) {
            return;
          }

          navigate({
            to: "/$accountBookId",
            params: { accountBookId: nextAccountBookId },
          });
        }}
      />
    </Suspense>
  );
}
