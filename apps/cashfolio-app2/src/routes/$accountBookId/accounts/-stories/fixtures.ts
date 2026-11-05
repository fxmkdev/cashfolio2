import { AccountType, Unit } from "@/.prisma-client/enums";
import { type AccountsPageViewProps } from "../-page-view";
import { type AccountsMode, type TabValue, type TreeRow } from "../-page-types";
export function createGroupRow(args: {
  id: string;
  name: string;
  parentId?: string;
  isActive: boolean;
  type: AccountType;
  sortOrder: number;
}): TreeRow {
  return {
    id: args.id,
    nodeType: "accountGroup",
    name: args.name,
    type: args.type,
    equityAccountSubtype: null,
    unit: null,
    currency: null,
    cryptocurrency: null,
    symbol: null,
    tradeCurrency: null,
    balance: null,
    balanceInReferenceCurrency: null,
    openingBalance: null,
    parentId: args.parentId,
    isActive: args.isActive,
    groupId: args.id,
    sortOrder: args.sortOrder,
    deletable: false,
    deleteDisabledReason: "Cannot delete group because it contains accounts",
    archivable: false,
    archiveDisabledReason:
      "Cannot archive group because it contains active sub-groups",
    unarchivable: !args.isActive,
    unarchiveDisabledReason: args.isActive
      ? "Group is already active"
      : undefined,
  };
}

export function createAccountRow(args: {
  id: string;
  name: string;
  groupId?: string;
  isActive: boolean;
  type: AccountType;
  sortOrder: number;
  currency: string;
  balance: number;
  balanceInReferenceCurrency: number;
}): TreeRow {
  return {
    id: args.id,
    nodeType: "account",
    name: args.name,
    type: args.type,
    equityAccountSubtype: null,
    unit: Unit.CURRENCY,
    currency: args.currency,
    cryptocurrency: null,
    symbol: null,
    tradeCurrency: null,
    balance: args.balance,
    balanceInReferenceCurrency: args.balanceInReferenceCurrency,
    openingBalance: null,
    parentId: args.groupId,
    isActive: args.isActive,
    groupId: args.groupId,
    sortOrder: args.sortOrder,
    deletable: true,
    deleteDisabledReason: undefined,
    archivable: args.isActive,
    archiveDisabledReason: args.isActive
      ? undefined
      : "Account is already archived",
    unarchivable: !args.isActive,
    unarchiveDisabledReason: args.isActive
      ? "Account is already active"
      : undefined,
  };
}

export const activeAssetRows: TreeRow[] = [
  createGroupRow({
    id: "group-assets",
    name: "Assets",
    type: AccountType.BALANCE,
    isActive: true,
    sortOrder: 0,
  }),
  createGroupRow({
    id: "group-cash",
    name: "Cash",
    parentId: "group-assets",
    type: AccountType.BALANCE,
    isActive: true,
    sortOrder: 0,
  }),
  createAccountRow({
    id: "account-checking",
    name: "Checking",
    groupId: "group-cash",
    type: AccountType.BALANCE,
    isActive: true,
    sortOrder: 0,
    currency: "CHF",
    balance: 1250.55,
    balanceInReferenceCurrency: 1250.55,
  }),
  createAccountRow({
    id: "account-wallet",
    name: "Wallet",
    groupId: "group-assets",
    type: AccountType.BALANCE,
    isActive: true,
    sortOrder: 1,
    currency: "CHF",
    balance: 120,
    balanceInReferenceCurrency: 120,
  }),
  createAccountRow({
    id: "account-holding",
    name: "USD Holding",
    groupId: "group-assets",
    type: AccountType.BALANCE,
    isActive: true,
    sortOrder: 2,
    currency: "USD",
    balance: 100,
    balanceInReferenceCurrency: 90,
  }),
];

export const archivedAssetRows: TreeRow[] = activeAssetRows.map((row) => ({
  ...row,
  isActive: false,
  archivable: false,
  archiveDisabledReason:
    row.nodeType === "accountGroup"
      ? "Group is already archived"
      : "Account is already archived",
  unarchivable: true,
  unarchiveDisabledReason: undefined,
}));

export const accountGroups: AccountsPageViewProps["accountGroups"] = [
  {
    value: "group-assets",
    label: "Assets",
    type: AccountType.BALANCE,
    equityAccountSubtype: null,
    isCashAccount: false,
    parentGroupId: null,
    treePath: [],
    treeLabel: "Assets",
  },
  {
    value: "group-cash",
    label: "Assets / Cash",
    type: AccountType.BALANCE,
    equityAccountSubtype: null,
    isCashAccount: true,
    parentGroupId: "group-assets",
    treePath: ["Assets"],
    treeLabel: "Cash",
  },
];

export const existingNodes: AccountsPageViewProps["existingNodes"] = [
  {
    id: "group-assets",
    name: "Assets",
    nodeType: "accountGroup",
    parentId: undefined,
    groupId: undefined,
    type: AccountType.BALANCE,
  },
  {
    id: "group-cash",
    name: "Cash",
    nodeType: "accountGroup",
    parentId: "group-assets",
    groupId: undefined,
    type: AccountType.BALANCE,
  },
  {
    id: "account-checking",
    name: "Checking",
    nodeType: "account",
    parentId: undefined,
    groupId: "group-cash",
    type: AccountType.BALANCE,
    unit: Unit.CURRENCY,
  },
  {
    id: "account-wallet",
    name: "Wallet",
    nodeType: "account",
    parentId: undefined,
    groupId: "group-assets",
    type: AccountType.BALANCE,
    unit: Unit.CURRENCY,
  },
];

export function getRowsFor(args: {
  mode: AccountsMode;
  tab: TabValue;
  showArchived?: boolean;
}): TreeRow[] {
  if (args.tab.startsWith("EQUITY-")) {
    const active = activeAssetRows.slice(0, 4).map((row, i) => ({
      ...row,
      name: ["Housing", "Utilities", "Electricity", "Rent"][i],
      type: AccountType.EQUITY,
      equityAccountSubtype:
        args.tab === "EQUITY-INCOME"
          ? ("INCOME" as const)
          : ("EXPENSE" as const),
      unit: null,
      currency: null,
      balance: null,
      balanceInReferenceCurrency: null,
      isActive: true,
      archivable: true,
      unarchivable: false,
      ...(i === 2
        ? {
            deletable: false,
            deleteDisabledReason:
              "Cannot delete account because it has bookings",
          }
        : {}),
    }));
    if (!args.showArchived) return active;
    return [
      ...active,
      {
        ...active[2],
        id: "archived-category-root",
        name: "Old Category",
        parentId: undefined,
        groupId: undefined,
        isActive: false,
        archivable: false,
        unarchivable: true,
      },
      {
        ...active[1],
        id: "archived-category-group",
        name: "Former Categories",
        parentId: active[0].id,
        isActive: false,
        archivable: false,
        unarchivable: true,
      },
      {
        ...active[2],
        id: "archived-category-child",
        name: "Old Child Category",
        parentId: "archived-category-group",
        groupId: "archived-category-group",
        isActive: false,
        archivable: false,
        unarchivable: false,
      },
    ];
  }
  if (args.tab !== "BALANCE") return [];
  return args.mode === "archived" ? archivedAssetRows : activeAssetRows;
}
