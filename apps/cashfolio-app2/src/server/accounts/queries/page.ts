import { loadAccountsPageSnapshot } from "./page-snapshot.server";
import { createAccountBookUnitUsage } from "../../../shared/account-book-unit-usage";
import type { AccountsPageDataInput } from "./types";
import { queryAccountTreeData } from "./tree";
import { queryAccountGroups, queryExistingNodes } from "./selectors";

export async function queryAccountsPageData(data: AccountsPageDataInput) {
  const accountState = data.accountState ?? "active";
  const { metadata, tree } = await loadAccountsPageSnapshot(data);

  const [
    treeData,
    accountGroups,
    existingNodes,
    archivedAccountGroups,
    archivedExistingNodes,
    unitUsageAccounts,
  ] = await Promise.all([
    queryAccountTreeData(
      {
        accountBookId: data.accountBookId,
        accountState,
        type: data.type,
        equityAccountSubtype: data.equityAccountSubtype,
        includeReferenceBalances: false,
      },
      tree,
    ),
    queryAccountGroups(
      data.accountBookId,
      accountState === "all" ? "active" : accountState,
      metadata,
    ),
    queryExistingNodes(
      data.accountBookId,
      accountState === "all" ? "active" : accountState,
      metadata,
    ),
    accountState === "all"
      ? queryAccountGroups(data.accountBookId, "inactive", metadata)
      : Promise.resolve([]),
    accountState === "all"
      ? queryExistingNodes(data.accountBookId, "inactive", metadata)
      : Promise.resolve([]),
    accountState !== "inactive"
      ? Promise.resolve(metadata.accounts.filter((account) => account.isActive))
      : Promise.resolve([]),
  ]);
  const unitUsage = createAccountBookUnitUsage({
    referenceCurrency: treeData.referenceCurrency,
    accounts: unitUsageAccounts,
  });

  return {
    accountGroups,
    existingNodes,
    archivedAccountGroups,
    archivedExistingNodes,
    referenceCurrency: treeData.referenceCurrency,
    unitUsage,
    rows: treeData.rows,
  };
}
