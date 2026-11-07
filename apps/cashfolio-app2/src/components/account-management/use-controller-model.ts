import { useAccountsPageData } from "./loading/use-page-data";
import { useAccountsPageModalState } from "./dialogs/state";
import { useAccountsPresentation } from "./grid/use-presentation";
import type { AccountsControllerOptions } from "./controller-types";

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
