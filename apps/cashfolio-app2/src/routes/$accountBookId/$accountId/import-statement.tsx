import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { notifications } from "@mantine/notifications";
import { Suspense, lazy, useMemo, useState } from "react";
import type { AccountOption } from "@/components/edit-transaction-modal";
import { createAccountBookUnitUsage } from "@/shared/account-book-unit-usage";
import { createAccountOptions } from "@/shared/account-options";
import { createDocumentTitleHead } from "@/shared/document-title";
import { createTransactions } from "@/server/transactions";
import { loadLedgerPageData } from "./-page-loader";
import { parseLedgerSearch } from "./-page-types";
import type { TransactionMutationValues } from "./-page-view";
import { getStatementImportSuccessLedgerSearch } from "./-statement-import-page-controller";
import {
  getStatementImportDisabledReason,
  shouldIncludeStatementImportAccountOption,
} from "./-statement-import";

const AccountStatementImportPageView = lazy(async () => {
  const module = await import("./-statement-import-page-view");
  return { default: module.AccountStatementImportPageView };
});

export const Route = createFileRoute(
  "/$accountBookId/$accountId/import-statement",
)({
  validateSearch: parseLedgerSearch,
  loaderDeps: ({ search }) => ({
    period: search.period,
  }),
  loader: async ({
    params: { accountBookId, accountId },
    deps: { period },
  }) => {
    const data = await loadLedgerPageData({ accountBookId, accountId, period });
    if (getStatementImportDisabledReason(data.account)) {
      throw redirect({
        to: "/$accountBookId/$accountId",
        params: { accountBookId, accountId },
        search: { period },
      });
    }

    return data;
  },
  head: ({ loaderData }) =>
    createDocumentTitleHead(
      loaderData
        ? `Import Statement - ${loaderData.account.name}`
        : "Import Statement",
    ),
  component: StatementImportRoutePage,
});

function StatementImportRoutePage() {
  const { accountBookId, accountId } = Route.useParams();
  return <StatementImportAccountPage key={`${accountBookId}/${accountId}`} />;
}

function StatementImportAccountPage() {
  const loaderData = Route.useLoaderData();
  const { accountBookId, accountId } = Route.useParams();
  const { period } = Route.useSearch();
  const navigate = Route.useNavigate();
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isImportComplete, setIsImportComplete] = useState(false);
  const unitUsage = useMemo(
    () =>
      createAccountBookUnitUsage({
        referenceCurrency: loaderData.referenceCurrency,
        accounts: loaderData.accounts,
      }),
    [loaderData.accounts, loaderData.referenceCurrency],
  );
  const accountOptions = useMemo<AccountOption[]>(
    () =>
      createAccountOptions(loaderData.accounts, (account) =>
        shouldIncludeStatementImportAccountOption(account, accountId),
      ),
    [accountId, loaderData.accounts],
  );
  const accountBookStartDate = useMemo(
    () => new Date(loaderData.periodBounds.minBookingDate),
    [loaderData.periodBounds.minBookingDate],
  );

  async function handleImport(transactions: TransactionMutationValues[]) {
    if (transactions.length === 0) {
      return;
    }

    const createdTransactions = await createTransactions({
      data: {
        accountBookId,
        transactions,
      },
    });
    setIsImportComplete(true);
    const search = getStatementImportSuccessLedgerSearch({
      selectedPeriodValue: period,
      transactions,
      createdTransactions,
    });

    notifications.show({
      title: "Statement imported",
      message: `${transactions.length} transaction${
        transactions.length === 1 ? "" : "s"
      } created.`,
      color: "green",
    });

    await router.invalidate();
    navigate({
      ignoreBlocker: true,
      to: "/$accountBookId/$accountId",
      params: { accountBookId, accountId },
      search,
    });
  }

  return (
    <Suspense fallback={null}>
      <AccountStatementImportPageView
        accountBookId={accountBookId}
        account={loaderData.account}
        statementImportCsvFormat={loaderData.account.statementImportCsvFormat!}
        accountBookStartDate={accountBookStartDate}
        accountOptions={accountOptions}
        unitUsage={unitUsage}
        isSubmitting={isSubmitting}
        isImportComplete={isImportComplete}
        period={period}
        onSubmittingChange={setIsSubmitting}
        onSubmit={handleImport}
      />
    </Suspense>
  );
}
