import {
  createFileRoute,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { Suspense, lazy } from "react";
import { parseAccountsSearch } from "./-page-types";
import { loadAccountsPageData } from "./-page-loader";
import { useAccountsPageController } from "./-page-controller";

const AccountsPageView = lazy(async () => {
  const module = await import("./-page-view");
  return { default: module.AccountsPageView };
});

export const Route = createFileRoute("/$accountBookId/accounts")({
  validateSearch: parseAccountsSearch,
  loaderDeps: ({ search }) => ({ mode: search.mode, tab: search.tab }),
  loader: async ({ params: { accountBookId }, deps: { mode, tab } }) => {
    return loadAccountsPageData({ accountBookId, mode, tab });
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
      <AccountsPageView {...viewProps} />
    </Suspense>
  );
}
