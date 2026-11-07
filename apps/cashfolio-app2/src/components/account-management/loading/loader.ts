import { getAccountsPageData } from "@/server/accounts";
import type { AccountsMode, TabValue } from "@/shared/account-tabs";
import { getTabDefinition } from "@/shared/account-tabs";

export async function loadAccountsPageData(args: {
  accountBookId: string;
  mode?: AccountsMode;
  showArchived?: boolean;
  tab: TabValue;
}) {
  const tabDefinition = getTabDefinition(args.tab);

  return getAccountsPageData({
    data: {
      accountBookId: args.accountBookId,
      accountState:
        tabDefinition.type === "EQUITY" && !args.showArchived
          ? "active"
          : "all",
      type: tabDefinition.type,
      ...("equityAccountSubtype" in tabDefinition
        ? { equityAccountSubtype: tabDefinition.equityAccountSubtype }
        : undefined),
    },
  });
}
