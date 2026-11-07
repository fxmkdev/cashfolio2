import { useOrganizeSession } from "@/components/hierarchy-organize/use-organize-session";
import type { AccountsGridRow } from "./-page-types";
import type { AccountsPageViewProps } from "./-page-view-types";

/** Shared coordination for Accounts layouts; effects use the supplied API/router. */
export function useAccountsPageInteractions(props: AccountsPageViewProps) {
  const canOrganize =
    (props.grouping ?? "accountStructure") === "accountStructure" &&
    !!props.organizerApi;
  const session = useOrganizeSession<AccountsGridRow>({
    accountBookId: props.accountBookId,
    requested: !!props.organize,
    available: canOrganize,
    page: "accounts",
    api: props.organizerApi,
    onSaved: props.onOrganizeSaved ?? (() => {}),
    onActivate: () => props.bulkAccountActions?.clearSelection(),
  });
  const onGridReady: AccountsPageViewProps["onGridReady"] = (event) => {
    session.normalGrid.current = event.api;
    props.onGridReady?.(event);
  };
  return { ...session, canOrganize, onGridReady };
}
