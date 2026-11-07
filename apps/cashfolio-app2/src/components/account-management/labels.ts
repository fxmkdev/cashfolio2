import type { AccountsMode } from "@/shared/account-tabs";
import type { AccountManagementContext } from "@/shared/account-presentation";
import type { RowTarget } from "./grid/rows";

export function getAccountsPageTitle(
  _mode: AccountsMode = "active",
  context: AccountManagementContext = "accounts",
): string {
  if (context === "categories") return "Income & Expense Categories";
  return "Accounts";
}
export function getEntityLabel(
  nodeType: RowTarget["nodeType"],
  context: AccountManagementContext = "accounts",
): string {
  if (context === "categories")
    return nodeType === "account" ? "Category" : "Category Group";
  return nodeType === "account" ? "Account" : "Group";
}
