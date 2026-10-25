import { AccountType } from "@/.prisma-client/enums";
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
