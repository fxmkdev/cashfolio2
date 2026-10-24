import { getAccountsPageData } from "@/server/accounts";
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
      accountState:
        tabDefinition.type === "EQUITY"
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
