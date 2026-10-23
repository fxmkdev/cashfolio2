import { getAccountsPageData } from "@/server/accounts";
import { isCategoryAccount } from "@/shared/account-presentation";
import type { AccountsMode, TabValue } from "./-page-types";
import { getTabDefinition } from "./-page-types";

export async function loadAccountsPageData(args: {
  accountBookId: string;
  mode: AccountsMode;
  tab: TabValue;
}) {
  const tabDefinition = getTabDefinition(args.tab);

  return getAccountsPageData({
    data: {
      accountBookId: args.accountBookId,
      accountState: isCategoryAccount(tabDefinition)
        ? args.mode === "archived"
          ? "inactive"
          : "active"
        : "all",
      type: tabDefinition.type,
      ...("equityAccountSubtype" in tabDefinition
        ? { equityAccountSubtype: tabDefinition.equityAccountSubtype }
        : undefined),
    },
  });
}
