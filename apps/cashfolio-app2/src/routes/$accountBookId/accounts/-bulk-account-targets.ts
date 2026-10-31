import { AccountType, Unit } from "@/.prisma-client/enums";
import {
  isReferenceCurrencyTotalFooterRow,
  type AccountsGridRow,
  type TreeRow,
} from "./-page-types";

export function isBulkAccountRow(
  row: AccountsGridRow | undefined,
): row is TreeRow {
  return (
    !!row &&
    !isReferenceCurrencyTotalFooterRow(row) &&
    row.type === AccountType.BALANCE
  );
}

export function isBulkAccount(
  row: AccountsGridRow | undefined,
): row is TreeRow {
  return isBulkAccountRow(row) && row.nodeType === "account";
}

export type AccountBulkActionTarget = {
  accountIds: string[];
  archivedCount: number;
};

export function createAccountBulkActionTarget(
  accounts: TreeRow[],
): AccountBulkActionTarget {
  return {
    accountIds: accounts.map((row) => row.id),
    archivedCount: accounts.filter((row) => !row.isActive).length,
  };
}

export function isTrackingMethodAccount(
  row: AccountsGridRow | undefined,
): row is TreeRow {
  return isBulkAccount(row) && row.unit === Unit.CURRENCY;
}

export type TrackingMethodBulkActionTarget = AccountBulkActionTarget & {
  skippedCount: number;
};

export function createTrackingMethodBulkActionTarget(
  accounts: TreeRow[],
): TrackingMethodBulkActionTarget {
  const eligibleAccounts = accounts.filter(isTrackingMethodAccount);
  return {
    ...createAccountBulkActionTarget(eligibleAccounts),
    skippedCount: accounts.length - eligibleAccounts.length,
  };
}
