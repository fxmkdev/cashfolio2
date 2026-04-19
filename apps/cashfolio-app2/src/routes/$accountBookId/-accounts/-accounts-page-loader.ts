import { getAccountsPageData } from "../../../server/accounts";
import type { AccountsMode, TabValue } from "./-accounts-page-types";
import { getTabDefinition } from "./-accounts-page-types";

export async function loadAccountsPageData(args: {
  accountBookId: string;
  mode: AccountsMode;
  tab: TabValue;
}) {
  const accountState = args.mode === "archived" ? "inactive" : "active";
  const tabDefinition = getTabDefinition(args.tab);

  return getAccountsPageData({
    data: {
      accountBookId: args.accountBookId,
      accountState,
      type: tabDefinition.type,
      ...("equityAccountSubtype" in tabDefinition
        ? { equityAccountSubtype: tabDefinition.equityAccountSubtype }
        : undefined),
    },
  });
}
