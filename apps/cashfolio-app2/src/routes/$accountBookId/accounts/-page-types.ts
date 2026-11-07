import { AccountType, EquityAccountSubtype } from "@/.prisma-client/enums";

import type { TabValue } from "@/shared/account-tabs";
import type { AccountManagementContext } from "@/shared/account-presentation";
import {
  isReportingGrouping,
  type ReportingGrouping,
} from "@/shared/reporting-grouping";

export const tabs = [
  { value: "BALANCE", label: "Accounts", type: "BALANCE" },
  {
    value: `EQUITY-${EquityAccountSubtype.INCOME}`,
    label: "Income",
    type: AccountType.EQUITY,
    equityAccountSubtype: EquityAccountSubtype.INCOME,
  },
  {
    value: `EQUITY-${EquityAccountSubtype.EXPENSE}`,
    label: "Expenses",
    type: AccountType.EQUITY,
    equityAccountSubtype: EquityAccountSubtype.EXPENSE,
  },
] as const;

export function getManagementTabs(context: AccountManagementContext) {
  return tabs.filter((tab) =>
    context === "categories"
      ? tab.type === AccountType.EQUITY
      : tab.type !== AccountType.EQUITY,
  );
}

export function parseCategoriesSearch(search: Record<string, unknown>) {
  return {
    tab: getManagementTabs("categories").some((tab) => tab.value === search.tab)
      ? (search.tab as TabValue)
      : ("EQUITY-INCOME" as const),
    showArchived:
      typeof search.showArchived === "boolean"
        ? search.showArchived
        : search.mode === "archived",
  };
}

export function getCategoriesRedirect(search: Record<string, unknown>) {
  return {
    to: "/$accountBookId/settings/categories" as const,
    search: parseCategoriesSearch(search),
    replace: true as const,
  };
}

export type { TabValue };
export type AccountsMode = "active" | "archived";

export function getAccountsPageTitle(
  _mode: AccountsMode = "active",
  context: AccountManagementContext = "accounts",
): string {
  if (context === "categories") return "Income & Expense Categories";
  return "Accounts";
}

export function getTabDefinition(tabValue: TabValue) {
  return tabs.find((tab) => tab.value === tabValue) ?? tabs[0];
}

export {
  REFERENCE_CURRENCY_TOTAL_FOOTER_ROW_ID,
  isReferenceCurrencyTotalFooterRow,
  toRowTarget,
  toAccountGridTreeRow,
  isPersistedTreeRow,
  isPersistedAccountRow,
  isPersistedGroupRow,
} from "./-account-grid-rows";
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
} from "./-account-grid-rows";
import type { RowTarget } from "./-account-grid-rows";
export const ROOT_PARENT_KEY = "__root__";

export function getEntityLabel(
  nodeType: RowTarget["nodeType"],
  context: AccountManagementContext = "accounts",
): string {
  if (context === "categories")
    return nodeType === "account" ? "Category" : "Category Group";
  return nodeType === "account" ? "Account" : "Group";
}

function isTabValue(value: unknown): value is TabValue {
  return typeof value === "string" && tabs.some((tab) => tab.value === value);
}

export function parseAccountsSearch(search: Record<string, unknown>): {
  tab: TabValue;
  mode: AccountsMode;
  showArchived?: boolean;
  grouping?: ReportingGrouping;
  organize?: true;
} {
  const tab = isTabValue(search.tab) ? search.tab : "BALANCE";
  return {
    tab,
    ...(tab === "BALANCE" &&
    search.grouping !== "assetClass" &&
    search.organize === true
      ? { organize: true as const }
      : {}),
    ...(isReportingGrouping(search.grouping)
      ? { grouping: search.grouping }
      : {}),
    ...(tab.startsWith("EQUITY-") && typeof search.showArchived === "boolean"
      ? { showArchived: search.showArchived }
      : {}),
    mode:
      tab.startsWith("EQUITY-") && search.mode === "archived"
        ? "archived"
        : "active",
  };
}

/** Normalize legacy Accounts URLs without losing a valid organizer request. */
export function getCanonicalAccountsSearch(
  searchStr: string,
  search: ReturnType<typeof parseAccountsSearch>,
) {
  const raw = new URLSearchParams(searchStr);
  if (
    raw.get("mode") !== "archived" &&
    raw.get("tab") === "BALANCE" &&
    !(raw.has("organize") && !search.organize)
  )
    return undefined;
  return {
    tab: "BALANCE" as const,
    mode: "active" as const,
    ...(search.grouping ? { grouping: search.grouping } : {}),
    ...(search.organize ? { organize: true as const } : {}),
  };
}
