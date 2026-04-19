import { createFileRoute, Outlet, useRouter } from "@tanstack/react-router";
import { Suspense, lazy } from "react";
import { AccountType } from "../../../.prisma-client/enums";
import { useTransactionScroll } from "../../../hooks/use-transaction-scroll";
import { loadLedgerPageData } from "./-ledger-page-loader";
import { useLedgerPageController } from "./-ledger-page-controller";
import { parseLedgerSearch, type LedgerRow } from "./-ledger-page-types";
import { LedgerViewSegmentedControl } from "./-ledger-view-segmented-control";

const LedgerPageView = lazy(async () => {
  const module = await import("./-ledger-page-view");
  return { default: module.LedgerPageView };
});

export const Route = createFileRoute("/$accountBookId/$accountId")({
  validateSearch: parseLedgerSearch,
  loader: async ({ params: { accountBookId, accountId } }) => {
    return loadLedgerPageData({ accountBookId, accountId });
  },
  component: LedgerLayout,
});

function LedgerLayout() {
  return <Outlet />;
}

export function LedgerPageContent() {
  const loaderData = Route.useLoaderData();
  const { accountBookId } = Route.useParams();
  const { transactionId } = Route.useSearch();
  const router = useRouter();

  const navigate = Route.useNavigate();
  const { pendingScrollRef, handleRowDataUpdated } =
    useTransactionScroll<LedgerRow>(transactionId, navigate);

  const viewProps = useLedgerPageController({
    loaderData,
    accountBookId,
    pendingScrollRef,
    invalidate: () => {
      router.invalidate();
    },
  });

  const isBalanceChartAvailable =
    viewProps.account.type === AccountType.ASSET ||
    viewProps.account.type === AccountType.LIABILITY;

  return (
    <Suspense fallback={null}>
      <LedgerPageView
        accountBookId={accountBookId}
        {...viewProps}
        viewSwitcher={
          isBalanceChartAvailable ? (
            <LedgerViewSegmentedControl
              accountBookId={accountBookId}
              accountId={viewProps.account.id}
              view="ledger"
            />
          ) : undefined
        }
        onRowDataUpdated={handleRowDataUpdated}
      />
    </Suspense>
  );
}
