import type {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../../.prisma-client/enums";
import { hasInactiveAncestorGroup } from "../accounts/accounts-helpers";
import {
  type ActionAvailability,
  accountTypeRequiresZeroBalanceForArchive,
  getAccountArchiveAvailability,
  getAccountDeleteAvailability,
  getAccountUnarchiveAvailability,
  getGroupArchiveAvailability,
  getGroupDeleteAvailability,
  getGroupUnarchiveAvailability,
} from "./account-tree-rules";

const ACTION_AVAILABILITY_NOT_REQUESTED_REASON =
  "Action availability not requested";

function unavailableActionAvailability(): ActionAvailability {
  return {
    enabled: false,
    disabledReason: ACTION_AVAILABILITY_NOT_REQUESTED_REASON,
  };
}

export type AccountTreeAccount = {
  id: string;
  name: string;
  type: AccountType;
  equityAccountSubtype: EquityAccountSubtype | null;
  unit: Unit | null;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
  groupId: string | null;
  isActive: boolean;
  sortOrder: number | null;
};

export type AccountTreeGroup = {
  id: string;
  name: string;
  type: AccountType;
  equityAccountSubtype: EquityAccountSubtype | null;
  parentGroupId: string | null;
  isActive: boolean;
  sortOrder: number | null;
};

export type AccountTreeRow = {
  id: string;
  nodeType: "account" | "accountGroup";
  name: string;
  type: AccountType;
  equityAccountSubtype: EquityAccountSubtype | null;
  unit: Unit | null;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
  balance: number | null;
  balanceInReferenceCurrency: number | null;
  openingBalance: number | null;
  hasBookings: boolean;
  parentId: string | undefined;
  isActive: boolean;
  groupId: string | undefined;
  sortOrder: number | null;
  deletable: boolean;
  deleteDisabledReason: string | undefined;
  archivable: boolean;
  archiveDisabledReason: string | undefined;
  unarchivable: boolean;
  unarchiveDisabledReason: string | undefined;
};

export function filterGroupsForAccountState(args: {
  accountState: "active" | "inactive";
  accountGroups: AccountTreeGroup[];
  accounts: Pick<AccountTreeAccount, "groupId">[];
}): AccountTreeGroup[] {
  if (args.accountState === "active") {
    return args.accountGroups.filter((group) => group.isActive);
  }

  const groupsById = new Map(
    args.accountGroups.map((group) => [group.id, group]),
  );
  const groupsToInclude = new Set<string>();

  for (const group of args.accountGroups) {
    if (!group.isActive) {
      let currentGroupId: string | null = group.id;
      while (currentGroupId) {
        groupsToInclude.add(currentGroupId);
        currentGroupId = groupsById.get(currentGroupId)?.parentGroupId ?? null;
      }
    }
  }

  for (const account of args.accounts) {
    let currentGroupId = account.groupId;
    while (currentGroupId) {
      groupsToInclude.add(currentGroupId);
      currentGroupId = groupsById.get(currentGroupId)?.parentGroupId ?? null;
    }
  }

  return args.accountGroups.filter((group) => groupsToInclude.has(group.id));
}

export function buildAccountRows(args: {
  accounts: AccountTreeAccount[];
  rawBalanceByAccountId: Map<string, number>;
  openingRawBalanceByAccountId: Map<string, number>;
  displayBalanceInReferenceCurrencyByAccountId: Map<string, number | null>;
  bookingCountByAccountId: Map<string, number>;
  groupById: Map<
    string,
    { id: string; parentGroupId: string | null; isActive: boolean }
  >;
  includeActionAvailability: boolean;
}): AccountTreeRow[] {
  return args.accounts.map((account) => {
    const rawBalance = args.rawBalanceByAccountId.get(account.id) ?? 0;

    const hasBookings = (args.bookingCountByAccountId.get(account.id) ?? 0) > 0;
    const requiresZeroBalance = accountTypeRequiresZeroBalanceForArchive(
      account.type,
    );
    const hasZeroBalance = !requiresZeroBalance || rawBalance === 0;
    const hasInactiveAncestor = hasInactiveAncestorGroup(
      account.groupId,
      args.groupById,
    );
    const deleteAvailability = args.includeActionAvailability
      ? getAccountDeleteAvailability(hasBookings)
      : unavailableActionAvailability();
    const archiveAvailability = args.includeActionAvailability
      ? getAccountArchiveAvailability({
          isActive: account.isActive,
          hasZeroBalance,
        })
      : unavailableActionAvailability();
    const unarchiveAvailability = args.includeActionAvailability
      ? getAccountUnarchiveAvailability({
          isActive: account.isActive,
          hasInactiveAncestor,
        })
      : unavailableActionAvailability();
    const displayBalance =
      account.type === "ASSET"
        ? rawBalance
        : account.type === "LIABILITY"
          ? -rawBalance
          : null;
    const displayBalanceInReferenceCurrency =
      args.displayBalanceInReferenceCurrencyByAccountId.get(account.id) ?? null;
    const openingRawBalance = args.openingRawBalanceByAccountId.get(account.id);
    const displayOpeningBalance =
      openingRawBalance == null
        ? null
        : account.type === "ASSET"
          ? openingRawBalance
          : account.type === "LIABILITY"
            ? -openingRawBalance
            : null;
    return {
      id: account.id,
      nodeType: "account",
      name: account.name,
      type: account.type,
      equityAccountSubtype: account.equityAccountSubtype,
      unit: account.unit,
      currency: account.currency,
      cryptocurrency: account.cryptocurrency,
      symbol: account.symbol,
      tradeCurrency: account.tradeCurrency,
      balance: displayBalance,
      balanceInReferenceCurrency: displayBalanceInReferenceCurrency,
      openingBalance: displayOpeningBalance,
      hasBookings,
      parentId: account.groupId ?? undefined,
      isActive: account.isActive,
      groupId: account.groupId ?? undefined,
      sortOrder: account.sortOrder,
      deletable: deleteAvailability.enabled,
      deleteDisabledReason: deleteAvailability.disabledReason,
      archivable: archiveAvailability.enabled,
      archiveDisabledReason: archiveAvailability.disabledReason,
      unarchivable: unarchiveAvailability.enabled,
      unarchiveDisabledReason: unarchiveAvailability.disabledReason,
    };
  });
}

export function buildGroupRows(args: {
  groups: AccountTreeGroup[];
  groupById: Map<
    string,
    { id: string; parentGroupId: string | null; isActive: boolean }
  >;
  includeActionAvailability: boolean;
  groupsWithChildAccounts: Set<string>;
  groupsWithChildGroups: Set<string>;
  groupsWithActiveChildAccounts: Set<string>;
  groupsWithActiveChildGroups: Set<string>;
}): AccountTreeRow[] {
  return args.groups.map((group) => {
    const hasChildAccounts = args.groupsWithChildAccounts.has(group.id);
    const hasChildGroups = args.groupsWithChildGroups.has(group.id);
    const hasActiveChildAccounts = args.groupsWithActiveChildAccounts.has(
      group.id,
    );
    const hasActiveChildGroups = args.groupsWithActiveChildGroups.has(group.id);
    const hasInactiveAncestor = hasInactiveAncestorGroup(
      group.parentGroupId,
      args.groupById,
    );
    const deleteAvailability = args.includeActionAvailability
      ? getGroupDeleteAvailability({
          hasChildAccounts,
          hasChildGroups,
        })
      : unavailableActionAvailability();
    const archiveAvailability = args.includeActionAvailability
      ? getGroupArchiveAvailability({
          isActive: group.isActive,
          hasActiveChildAccounts,
          hasActiveChildGroups,
        })
      : unavailableActionAvailability();
    const unarchiveAvailability = args.includeActionAvailability
      ? getGroupUnarchiveAvailability({
          isActive: group.isActive,
          hasInactiveAncestor,
        })
      : unavailableActionAvailability();

    return {
      id: group.id,
      nodeType: "accountGroup",
      name: group.name,
      type: group.type,
      equityAccountSubtype: group.equityAccountSubtype,
      unit: null,
      currency: null,
      cryptocurrency: null,
      symbol: null,
      tradeCurrency: null,
      balance: null,
      balanceInReferenceCurrency: null,
      openingBalance: null,
      hasBookings: false,
      parentId: group.parentGroupId ?? undefined,
      isActive: group.isActive,
      groupId: group.id,
      sortOrder: group.sortOrder,
      deletable: deleteAvailability.enabled,
      deleteDisabledReason: deleteAvailability.disabledReason,
      archivable: archiveAvailability.enabled,
      archiveDisabledReason: archiveAvailability.disabledReason,
      unarchivable: unarchiveAvailability.enabled,
      unarchiveDisabledReason: unarchiveAvailability.disabledReason,
    };
  });
}

export function sortAccountTreeRows(rows: AccountTreeRow[]): AccountTreeRow[] {
  const sortedRows = [...rows];
  sortedRows.sort((left, right) => {
    const parentLeft = left.parentId ?? "";
    const parentRight = right.parentId ?? "";
    if (parentLeft !== parentRight) {
      return parentLeft.localeCompare(parentRight);
    }

    if (left.sortOrder !== right.sortOrder) {
      if (left.sortOrder == null) return 1;
      if (right.sortOrder == null) return -1;
      return left.sortOrder - right.sortOrder;
    }

    return left.name.localeCompare(right.name);
  });

  return sortedRows;
}
