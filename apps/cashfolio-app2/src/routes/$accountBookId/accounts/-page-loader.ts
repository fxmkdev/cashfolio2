import { getAccountsPageData } from "@/server/accounts";
import { getUserAccountBooks } from "@/server/home";
import type { AccountsMode, TabValue } from "./-page-types";
import { getTabDefinition } from "./-page-types";

export async function loadAccountsPageData(args: {
  accountBookId: string;
  mode: AccountsMode;
  tab: TabValue;
}) {
  const accountState = args.mode === "archived" ? "inactive" : "active";
  const tabDefinition = getTabDefinition(args.tab);

  const [accountsPageData, accountBooks] = await Promise.all([
    getAccountsPageData({
      data: {
        accountBookId: args.accountBookId,
        accountState,
        type: tabDefinition.type,
        ...("equityAccountSubtype" in tabDefinition
          ? { equityAccountSubtype: tabDefinition.equityAccountSubtype }
          : undefined),
      },
    }),
    getUserAccountBooks(),
  ]);

  return {
    ...accountsPageData,
    accountBooks,
  };
}
