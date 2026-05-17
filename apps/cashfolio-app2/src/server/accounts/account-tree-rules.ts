import type { AccountType } from "../../.prisma-client/enums";

export type ActionAvailability =
  | { enabled: true; disabledReason: undefined }
  | { enabled: false; disabledReason: string };

const ACCOUNT_DELETE_HAS_BOOKINGS_REASON =
  "Cannot delete account because it has bookings";
const ACCOUNT_ARCHIVE_ALREADY_ARCHIVED_REASON = "Account is already archived";
const ACCOUNT_ARCHIVE_NON_ZERO_BALANCE_REASON =
  "Cannot archive account because its current or scheduled balance is not 0";
const ACCOUNT_UNARCHIVE_ALREADY_ACTIVE_REASON = "Account is already active";
const ACCOUNT_UNARCHIVE_PARENT_ARCHIVED_REASON =
  "Cannot unarchive account because its parent group is archived";

const GROUP_DELETE_HAS_ACCOUNTS_REASON =
  "Cannot delete group because it contains accounts";
const GROUP_DELETE_HAS_CHILD_GROUPS_REASON =
  "Cannot delete group because it contains sub-groups";
const GROUP_ARCHIVE_ALREADY_ARCHIVED_REASON = "Group is already archived";
const GROUP_ARCHIVE_HAS_ACTIVE_ACCOUNTS_REASON =
  "Cannot archive group because it contains active accounts";
const GROUP_ARCHIVE_HAS_ACTIVE_CHILD_GROUPS_REASON =
  "Cannot archive group because it contains active sub-groups";
const GROUP_UNARCHIVE_ALREADY_ACTIVE_REASON = "Group is already active";
const GROUP_UNARCHIVE_PARENT_ARCHIVED_REASON =
  "Cannot unarchive group because its parent group is archived";

function enabled(): ActionAvailability {
  return { enabled: true, disabledReason: undefined };
}

function disabled(disabledReason: string): ActionAvailability {
  return { enabled: false, disabledReason };
}

export function accountTypeRequiresZeroBalanceForArchive(
  accountType: AccountType,
): boolean {
  return accountType === "ASSET" || accountType === "LIABILITY";
}

export function getAccountDeleteAvailability(
  hasBookings: boolean,
): ActionAvailability {
  return hasBookings ? disabled(ACCOUNT_DELETE_HAS_BOOKINGS_REASON) : enabled();
}

export function getAccountArchiveAvailability(params: {
  isActive: boolean;
  hasZeroBalance: boolean;
}): ActionAvailability {
  const { isActive, hasZeroBalance } = params;
  if (!isActive) return disabled(ACCOUNT_ARCHIVE_ALREADY_ARCHIVED_REASON);
  if (!hasZeroBalance) return disabled(ACCOUNT_ARCHIVE_NON_ZERO_BALANCE_REASON);
  return enabled();
}

export function getAccountUnarchiveAvailability(params: {
  isActive: boolean;
  hasInactiveAncestor: boolean;
}): ActionAvailability {
  const { isActive, hasInactiveAncestor } = params;
  if (isActive) return disabled(ACCOUNT_UNARCHIVE_ALREADY_ACTIVE_REASON);
  if (hasInactiveAncestor) {
    return disabled(ACCOUNT_UNARCHIVE_PARENT_ARCHIVED_REASON);
  }
  return enabled();
}

export function getGroupDeleteAvailability(params: {
  hasChildAccounts: boolean;
  hasChildGroups: boolean;
}): ActionAvailability {
  const { hasChildAccounts, hasChildGroups } = params;
  if (hasChildAccounts) return disabled(GROUP_DELETE_HAS_ACCOUNTS_REASON);
  if (hasChildGroups) return disabled(GROUP_DELETE_HAS_CHILD_GROUPS_REASON);
  return enabled();
}

export function getGroupArchiveAvailability(params: {
  isActive: boolean;
  hasActiveChildAccounts: boolean;
  hasActiveChildGroups: boolean;
}): ActionAvailability {
  const { isActive, hasActiveChildAccounts, hasActiveChildGroups } = params;
  if (!isActive) return disabled(GROUP_ARCHIVE_ALREADY_ARCHIVED_REASON);
  if (hasActiveChildAccounts) {
    return disabled(GROUP_ARCHIVE_HAS_ACTIVE_ACCOUNTS_REASON);
  }
  if (hasActiveChildGroups) {
    return disabled(GROUP_ARCHIVE_HAS_ACTIVE_CHILD_GROUPS_REASON);
  }
  return enabled();
}

export function getGroupUnarchiveAvailability(params: {
  isActive: boolean;
  hasInactiveAncestor: boolean;
}): ActionAvailability {
  const { isActive, hasInactiveAncestor } = params;
  if (isActive) return disabled(GROUP_UNARCHIVE_ALREADY_ACTIVE_REASON);
  if (hasInactiveAncestor)
    return disabled(GROUP_UNARCHIVE_PARENT_ARCHIVED_REASON);
  return enabled();
}
