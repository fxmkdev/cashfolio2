import { AccountType } from "@/.prisma-client/enums";
import {
  isReferenceCurrencyTotalFooterRow,
  type AccountsGridRow,
  type TreeRow,
} from "./-page-types";

export function isAssetClassSelectionRow(
  row: AccountsGridRow | undefined,
): row is TreeRow {
  return (
    !!row &&
    !isReferenceCurrencyTotalFooterRow(row) &&
    row.type === AccountType.BALANCE
  );
}

export function isAssetClassAccount(
  row: AccountsGridRow | undefined,
): row is TreeRow {
  return isAssetClassSelectionRow(row) && row.nodeType === "account";
}

export type AssetClassAssignmentTarget = {
  accountIds: string[];
  archivedCount: number;
};

export function createAssetClassAssignmentTarget(
  accounts: TreeRow[],
): AssetClassAssignmentTarget {
  return {
    accountIds: accounts.map((row) => row.id),
    archivedCount: accounts.filter((row) => !row.isActive).length,
  };
}
