import type { AccountsPageViewProps } from "./view-types";
import type { AccountManagementContext } from "@/shared/accounts/account-presentation";
import type { loadAccountsPageData } from "./loading/loader";
type AccountsPageLoaderData = Awaited<ReturnType<typeof loadAccountsPageData>>;
export type AccountsPageControllerOptions = {
  managementContext?: AccountManagementContext;
  loaderData: AccountsPageLoaderData;
  accountBookId: string;
  tab: AccountsPageViewProps["tab"];
  mode?: AccountsPageViewProps["mode"];
  showArchived?: boolean;
  organize?: boolean;
  grouping?: AccountsPageViewProps["grouping"];
  onGroupingChange?: AccountsPageViewProps["onGroupingChange"];
  onShowArchivedChange?: AccountsPageViewProps["onShowArchivedChange"];
  invalidate: () => void;
  onOpenLedger: AccountsPageViewProps["onOpenLedger"];
};
export type AccountsControllerOptions = AccountsPageControllerOptions & {
  mode: AccountsPageViewProps["mode"];
  grouping: NonNullable<AccountsPageViewProps["grouping"]>;
  showArchived: boolean;
};
