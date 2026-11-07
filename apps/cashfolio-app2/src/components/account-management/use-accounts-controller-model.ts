import { useAccountsPageData } from "./use-accounts-page-data";
import { useAccountsPageModalState } from "./page-modal-state";
import { useAccountsPresentation } from "./use-accounts-presentation";
import type { AccountsControllerOptions } from "./page-controller-types";

export function useAccountsControllerModel(options: AccountsControllerOptions) {
  const data = useAccountsPageData(options);
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
  return { data, modalState, presentation };
}
export type AccountsControllerModel = ReturnType<
  typeof useAccountsControllerModel
>;
