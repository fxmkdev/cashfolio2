import { AccountType, Unit } from "../../.prisma-client/enums";
import type { GroupTreeOption } from "../account-tree/group-tree-select";

const CASH_GROUP_INHERITED_DISABLED_REASON =
  "Cash account status is inherited from the parent group.";
const CASH_GROUP_INELIGIBLE_DESCENDANTS_DISABLED_REASON =
  "Cash account groups can contain only currency accounts and account sub-groups.";
const CASH_GROUP_ACCOUNT_COMPATIBILITY_ERROR =
  "Cash account groups can contain only currency accounts.";

export type AccountGroupOption = GroupTreeOption & {
  type: string;
  equityAccountSubtype: string | null;
};

export type ExistingNode = {
  id: string;
  name: string;
  nodeType: "account" | "accountGroup";
  parentId?: string;
  groupId?: string;
  type?: AccountType;
  unit?: Unit | null;
};

function getSelectedGroup(
  accountGroups: AccountGroupOption[],
  groupId?: string | null,
) {
  return groupId
    ? accountGroups.find((group) => group.value === groupId)
    : undefined;
}

export function isRootCashAccountEditable(args: {
  type?: AccountType;
  unit?: Unit;
  groupId?: string | null;
}) {
  return (
    (args.type === AccountType.ASSET || args.type === AccountType.LIABILITY) &&
    args.unit === Unit.CURRENCY &&
    !args.groupId
  );
}

export function getCashAccountDisabledReason(args: {
  type?: AccountType;
  unit?: Unit;
  groupId?: string | null;
}) {
  if (isRootCashAccountEditable(args)) return undefined;
  if (args.groupId) {
    return "Cash account status is inherited from the selected group.";
  }
  return "Only root-level currency accounts can be marked as cash accounts.";
}

export function resolveAccountCashAccountFormValue(args: {
  type?: AccountType;
  unit?: Unit;
  groupId?: string | null;
  isCashAccount?: boolean | null;
  accountGroups: AccountGroupOption[];
}) {
  const selectedGroup = getSelectedGroup(args.accountGroups, args.groupId);
  if (selectedGroup) {
    return selectedGroup.isCashAccount ?? false;
  }

  return isRootCashAccountEditable(args)
    ? (args.isCashAccount ?? false)
    : false;
}

export function isAccountGroupCompatibleWithAccountCashRules(args: {
  accountType?: AccountType;
  accountUnit?: Unit;
  group: Pick<AccountGroupOption, "isCashAccount">;
}) {
  if (!args.group.isCashAccount) return true;
  return (
    (args.accountType === AccountType.ASSET ||
      args.accountType === AccountType.LIABILITY) &&
    args.accountUnit === Unit.CURRENCY
  );
}

export function getAccountCashParentCompatibilityError(args: {
  accountType?: AccountType;
  accountUnit?: Unit;
  groupId?: string | null;
  accountGroups: AccountGroupOption[];
}) {
  const selectedGroup = getSelectedGroup(args.accountGroups, args.groupId);
  if (!selectedGroup?.isCashAccount) return null;
  return isAccountGroupCompatibleWithAccountCashRules({
    accountType: args.accountType,
    accountUnit: args.accountUnit,
    group: selectedGroup,
  })
    ? null
    : CASH_GROUP_ACCOUNT_COMPATIBILITY_ERROR;
}

export function applyAccountGroupCashInheritance<
  T extends {
    type?: AccountType;
    unit?: Unit;
    groupId?: string | null;
    isCashAccount?: boolean | null;
  },
>(
  values: T,
  accountGroups: AccountGroupOption[],
): T & { isCashAccount: boolean } {
  return {
    ...values,
    isCashAccount: resolveAccountCashAccountFormValue({
      type: values.type,
      unit: values.unit,
      groupId: values.groupId,
      isCashAccount: values.isCashAccount,
      accountGroups,
    }),
  };
}

function getSelectedParentGroup(
  accountGroups: AccountGroupOption[],
  parentGroupId?: string | null,
) {
  return parentGroupId
    ? accountGroups.find((group) => group.value === parentGroupId)
    : undefined;
}

export function isRootCashAccountGroupEditable(args: {
  type?: AccountType;
  parentGroupId?: string | null;
}) {
  return (
    (args.type === AccountType.ASSET || args.type === AccountType.LIABILITY) &&
    !args.parentGroupId
  );
}

function getDescendantNodes(args: {
  groupId?: string;
  existingNodes?: ExistingNode[];
}) {
  if (!args.groupId || !args.existingNodes) return [];

  const childGroupIdsByParentId = new Map<string, string[]>();
  for (const node of args.existingNodes) {
    if (node.nodeType !== "accountGroup" || !node.parentId) continue;
    const childGroupIds = childGroupIdsByParentId.get(node.parentId) ?? [];
    childGroupIds.push(node.id);
    childGroupIdsByParentId.set(node.parentId, childGroupIds);
  }

  const descendantGroupIds = new Set<string>();
  const stack = [...(childGroupIdsByParentId.get(args.groupId) ?? [])];
  while (stack.length > 0) {
    const groupId = stack.pop();
    if (!groupId || descendantGroupIds.has(groupId)) continue;
    descendantGroupIds.add(groupId);
    stack.push(...(childGroupIdsByParentId.get(groupId) ?? []));
  }

  return args.existingNodes.filter((node) => {
    if (node.nodeType === "accountGroup") {
      return descendantGroupIds.has(node.id);
    }
    return (
      node.groupId === args.groupId ||
      descendantGroupIds.has(node.groupId ?? "")
    );
  });
}

export function canMarkAccountGroupSubtreeAsCash(args: {
  groupId?: string;
  existingNodes?: ExistingNode[];
}) {
  const descendants = getDescendantNodes(args);
  return descendants.every((node) => {
    if (node.nodeType === "accountGroup") {
      return (
        node.type === AccountType.ASSET || node.type === AccountType.LIABILITY
      );
    }
    return (
      (node.type === AccountType.ASSET ||
        node.type === AccountType.LIABILITY) &&
      node.unit === Unit.CURRENCY
    );
  });
}

export function getCashAccountGroupDisabledReason(args: {
  type?: AccountType;
  parentGroupId?: string | null;
  groupId?: string;
  existingNodes?: ExistingNode[];
}) {
  if (args.type !== AccountType.ASSET && args.type !== AccountType.LIABILITY)
    return undefined;
  if (args.parentGroupId) return CASH_GROUP_INHERITED_DISABLED_REASON;
  if (
    !canMarkAccountGroupSubtreeAsCash({
      groupId: args.groupId,
      existingNodes: args.existingNodes,
    })
  ) {
    return CASH_GROUP_INELIGIBLE_DESCENDANTS_DISABLED_REASON;
  }
  return undefined;
}

export function getAccountGroupCashParentCompatibilityError(args: {
  type?: AccountType;
  parentGroupId?: string | null;
  groupId?: string;
  accountGroups: AccountGroupOption[];
  existingNodes?: ExistingNode[];
}) {
  const parentGroup = getSelectedParentGroup(
    args.accountGroups,
    args.parentGroupId,
  );
  if (!parentGroup?.isCashAccount) return null;
  if (args.type !== AccountType.ASSET && args.type !== AccountType.LIABILITY) {
    return "Cash account groups must contain only account groups.";
  }
  return canMarkAccountGroupSubtreeAsCash({
    groupId: args.groupId,
    existingNodes: args.existingNodes,
  })
    ? null
    : CASH_GROUP_INELIGIBLE_DESCENDANTS_DISABLED_REASON;
}

export function resolveAccountGroupCashAccountFormValue(args: {
  type?: AccountType;
  parentGroupId?: string | null;
  isCashAccount?: boolean | null;
  accountGroups: AccountGroupOption[];
}) {
  const parentGroup = getSelectedParentGroup(
    args.accountGroups,
    args.parentGroupId,
  );
  if (parentGroup) {
    return parentGroup.isCashAccount ?? false;
  }

  return isRootCashAccountGroupEditable(args)
    ? (args.isCashAccount ?? false)
    : false;
}

export function applyAccountGroupParentCashInheritance<
  T extends {
    type?: AccountType;
    parentGroupId?: string | null;
    isCashAccount?: boolean | null;
  },
>(
  values: T,
  accountGroups: AccountGroupOption[],
): T & { isCashAccount: boolean } {
  return {
    ...values,
    isCashAccount: resolveAccountGroupCashAccountFormValue({
      type: values.type,
      parentGroupId: values.parentGroupId,
      isCashAccount: values.isCashAccount,
      accountGroups,
    }),
  };
}
