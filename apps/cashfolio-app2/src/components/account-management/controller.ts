import { useMemo } from "react";
import { createAccountOrganizerApi } from "./management/organizer-api";
import { useAccountsControllerModel } from "./use-controller-model";
import { useAccountsControllerGrid } from "./grid/use-controller-grid";
import { useAccountsManagement } from "./management/use-management";
import { getAccountsControllerViewProps } from "./controller-view-props";
import type {
  AccountsPageControllerOptions,
  AccountsControllerOptions,
} from "./controller-types";
import type { AccountsPageViewProps } from "./view-types";

export function useAccountsPageController(
  args: AccountsPageControllerOptions,
): AccountsPageViewProps {
  const options: AccountsControllerOptions = {
    ...args,
    mode: args.mode ?? "active",
    showArchived: args.showArchived ?? false,
    grouping:
      args.managementContext === "categories"
        ? "accountStructure"
        : (args.grouping ?? "accountStructure"),
  };
  const organizerApi = useMemo(
    () =>
      createAccountOrganizerApi({
        accountBookId: args.accountBookId,
        managementContext: args.managementContext,
        tab: args.tab,
      }),
    [args.accountBookId, args.managementContext, args.tab],
  );
  const model = useAccountsControllerModel(options);
  const management = useAccountsManagement({
    ...options,
    scopeKey: model.data.scopeKey,
    isEquityTab: model.data.isEquityTab,
    rows: model.presentation.rows,
    accountGroups: model.data.loaderData.accountGroups,
    modalState: model.modalState,
    onRefreshConstraints: model.data.onRefreshConstraints,
  });
  const grid = useAccountsControllerGrid({ options, model, management });
  return getAccountsControllerViewProps({
    options,
    model,
    management,
    grid,
    organizerApi,
  });
}
