import { getAccountGroups, getAccountTreeData } from "../../server/accounts";
import type { AccountsMode, TabValue } from "./accounts-page-types";
import { tabs } from "./accounts-page-types";

export async function loadAccountsPageData(args: {
  accountBookId: string;
  mode: AccountsMode;
}) {
  const accountState = args.mode === "archived" ? "inactive" : "active";
  const accountGroupsPromise: Promise<
    Awaited<ReturnType<typeof getAccountGroups>>
  > =
    args.mode === "active"
      ? getAccountGroups({ data: { accountBookId: args.accountBookId } })
      : Promise.resolve([]);

  const [accountGroups, ...treeDataByTab] = await Promise.all([
    accountGroupsPromise,
    ...tabs.map((tab) =>
      getAccountTreeData({
        data: {
          accountBookId: args.accountBookId,
          accountState,
          type: tab.type,
          ...("equityAccountSubtype" in tab
            ? { equityAccountSubtype: tab.equityAccountSubtype }
            : undefined),
        },
      }),
    ),
  ]);

  const referenceCurrency = treeDataByTab[0].referenceCurrency;
  const treeData = Object.fromEntries(
    tabs.map((tab, index) => [tab.value, treeDataByTab[index].rows]),
  ) as Record<TabValue, Awaited<ReturnType<typeof getAccountTreeData>>["rows"]>;
  const existingNodes = treeDataByTab.flatMap((tabData) =>
    tabData.rows.map((node) => ({
      id: node.id,
      name: node.name,
      nodeType: node.nodeType,
      parentId: node.parentId,
      groupId: node.groupId,
    })),
  );

  return { accountGroups, treeData, existingNodes, referenceCurrency };
}
