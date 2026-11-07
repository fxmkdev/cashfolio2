import type { Unit, AccountTrackingMethod } from "../.prisma-client/enums";
import type { ClassificationNode } from "./asset-class";
import { projectArchivedAccountHierarchy } from "./archived-account-hierarchy";
import { getGainLossInvestmentGroup } from "./investment-group";
import type { ReportingGrouping } from "./reporting-grouping";

export const assetClassRowId = (id: string) => `__asset_class__:${id}`;
export const UNCLASSIFIED_ROW_ID = "__asset_class_unclassified__";
export const unitRowId = (classId: string, key: string) =>
  `__asset_class_unit__:${encodeURIComponent(classId)}:${encodeURIComponent(key)}`;
export const archivedClassRowId = (id: string) =>
  `__asset_class_archived__:${id}`;

export type ReturnAccount = {
  id: string;
  name: string;
  groupId: string | null;
  isActive: boolean;
  assetClassId: string | null;
  trackingMethod: AccountTrackingMethod;
  unit: Unit | null;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
};
export type ReturnGroup = {
  id: string;
  name: string;
  parentGroupId: string | null;
  isActive: boolean;
};

/** Identical memberships for the displayed hierarchy and server-side performance scopes. */
export function buildAccountReturnGroups(args: {
  accounts: ReturnAccount[];
  groups: ReturnGroup[];
  classes: ClassificationNode[];
  grouping: ReportingGrouping;
}) {
  const result = new Map<string, { name: string; accountIds: Set<string> }>();
  const add = (id: string, name: string, accountId: string) => {
    const entry = result.getOrInsertComputed(id, () => ({
      name,
      accountIds: new Set<string>(),
    }));
    entry.accountIds.add(accountId);
  };
  if (args.grouping === "assetClass") {
    const classes = new Map(args.classes.map((node) => [node.id, node]));
    for (const account of args.accounts) {
      let node = account.assetClassId
        ? classes.get(account.assetClassId)
        : undefined;
      const classId = node ? assetClassRowId(node.id) : UNCLASSIFIED_ROW_ID;
      if (!node) add(classId, "Unclassified", account.id);
      const visited = new Set<string>();
      while (node && !visited.has(node.id)) {
        visited.add(node.id);
        add(assetClassRowId(node.id), node.name, account.id);
        node = node.parentId ? classes.get(node.parentId) : undefined;
      }
      const investment = getGainLossInvestmentGroup(account);
      const unitId = unitRowId(classId, investment.key);
      add(unitId, investment.label, account.id);
      if (!account.isActive)
        add(archivedClassRowId(unitId), "Archived", account.id);
    }
  } else {
    const projection = projectArchivedAccountHierarchy([
      ...args.groups.map((group) => ({
        ...group,
        nodeType: "accountGroup" as const,
        parentId: group.parentGroupId ?? undefined,
      })),
      ...args.accounts.map((account) => ({
        ...account,
        nodeType: "account" as const,
        parentId: account.groupId ?? undefined,
      })),
    ]);
    const names = new Map(args.groups.map((group) => [group.id, group.name]));
    for (const account of args.accounts) {
      let parent = projection.parentIdById.get(account.id);
      const visited = new Set<string>();
      while (parent && !visited.has(parent)) {
        visited.add(parent);
        add(parent, names.get(parent) ?? "Archived", account.id);
        parent = projection.parentIdById.get(parent);
      }
    }
  }
  return result;
}
