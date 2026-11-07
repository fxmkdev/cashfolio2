import type { AccountsMode } from "@/shared/account-tabs";
import type { AccountManagementContext } from "@/shared/account-presentation";

export function getAccountsPageTitle(
  _mode: AccountsMode = "active",
  context: AccountManagementContext = "accounts",
): string {
  if (context === "categories") return "Income & Expense Categories";
  return "Accounts";
}

export {
  REFERENCE_CURRENCY_TOTAL_FOOTER_ROW_ID,
  isReferenceCurrencyTotalFooterRow,
  toRowTarget,
  toAccountGridTreeRow,
  isPersistedTreeRow,
  isPersistedAccountRow,
  isPersistedGroupRow,
} from "./account-grid-rows";
export type {
  GroupAssetClassSummary,
  TreeRow,
  AccountsGridRow,
  AccountGridTreeRow,
  PersistedTreeRow,
  PersistedAccountRow,
  PersistedGroupRow,
  DisplayHeadingRow,
  ReferenceCurrencyTotalFooterRow,
  RowTarget,
} from "./account-grid-rows";
import type { RowTarget } from "./account-grid-rows";
export const ROOT_PARENT_KEY = "__root__";

export function getEntityLabel(
  nodeType: RowTarget["nodeType"],
  context: AccountManagementContext = "accounts",
): string {
  if (context === "categories")
    return nodeType === "account" ? "Category" : "Category Group";
  return nodeType === "account" ? "Account" : "Group";
}
