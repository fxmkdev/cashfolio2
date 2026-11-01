import { useRefreshAssetClasses } from "@/classification-context";
import { getAccountGainLossSummaries } from "@/server/account-gain-loss";
import { useGainLossRequest } from "@/hooks/use-gain-loss-request";
import { useRefreshedMutationData } from "@/hooks/use-refreshed-mutation-data";
import { useCallback } from "react";
import { useAccountsReferenceBalanceRows } from "./-page-reference-balances";
import { loadAccountsPageData } from "./-page-loader";
import type { AccountsPageViewProps } from "./-page-view";
import { type AccountManagementContext } from "@/shared/account-presentation";
export type AccountsPageDataOptions = {
  managementContext?: AccountManagementContext;
  loaderData: Awaited<ReturnType<typeof loadAccountsPageData>>;
  accountBookId: string;
  tab: AccountsPageViewProps["tab"];
  mode: AccountsPageViewProps["mode"];
  showArchived: boolean;
};

export function useAccountsPageData(args: AccountsPageDataOptions) {
  const { mode, showArchived } = args;
  const scopeKey = `${args.accountBookId}:${args.tab}:${mode}:${showArchived}`;
  const refreshAssetClasses = useRefreshAssetClasses();
  const { data: loaderData, refresh: refreshPageConstraints } =
    useRefreshedMutationData(args.loaderData, () =>
      loadAccountsPageData({
        accountBookId: args.accountBookId,
        tab: args.tab,
        showArchived,
      }),
    );
  const onRefreshConstraints = useCallback(async () => {
    await Promise.all([refreshPageConstraints(), refreshAssetClasses()]);
  }, [refreshPageConstraints, refreshAssetClasses]);

  const {
    isEquityTab,
    rowsWithAccountReferenceBalances,
    shouldShowReferenceBalancesLoading,
  } = useAccountsReferenceBalanceRows({
    accountBookId: args.accountBookId,
    tab: args.tab,
    mode,
    referenceCurrency: loaderData.referenceCurrency,
    rows: loaderData.rows,
  });

  const loadGainLoss = useCallback(
    () =>
      getAccountGainLossSummaries({
        data: {
          accountBookId: args.accountBookId,
          type: "BALANCE",
          accountState: "all",
        },
      }),
    [args.accountBookId],
  );
  const gainLoss = useGainLossRequest({
    enabled: !isEquityTab,
    scopeKey,
    refreshKey: loaderData,
    load: loadGainLoss,
  });

  return {
    loaderData,
    scopeKey,
    onRefreshConstraints,
    isEquityTab,
    rowsWithAccountReferenceBalances,
    shouldShowReferenceBalancesLoading,
    gainLoss,
  };
}
