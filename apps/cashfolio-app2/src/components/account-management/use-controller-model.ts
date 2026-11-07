import { useAccountsPageData } from "./loading/use-page-data";
import { useAccountsPageModalState } from "./dialogs/state";
import { useAccountsPresentation } from "./grid/use-presentation";
import type { AccountsControllerOptions } from "./controller-types";
import { useAccountReturns } from "./use-account-returns";

export function useAccountsControllerModel(options: AccountsControllerOptions) {
  const data = useAccountsPageData(options);
  const returns = useAccountReturns({
    accountBookId: options.accountBookId,
    grouping: options.grouping,
    enabled: !data.isEquityTab,
    refreshKey: data.loaderData,
  });
  const modalState = useAccountsPageModalState(
    `${options.accountBookId}:${options.tab}`,
    options.managementContext === "categories",
  );
  const presentation = useAccountsPresentation({
    sourceRows: data.rowsWithAccountReferenceBalances,
    grouping: options.grouping,
    isEquityTab: data.isEquityTab,
    gainLossData: data.gainLoss.data,
  });
  return { data, modalState, presentation, returns };
}
export type AccountsControllerModel = ReturnType<
  typeof useAccountsControllerModel
>;
