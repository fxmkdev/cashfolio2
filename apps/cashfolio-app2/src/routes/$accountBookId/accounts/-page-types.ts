import { AccountType, EquityAccountSubtype } from "@/.prisma-client/enums";
import type { getAccountTreeData } from "@/server/accounts";
import type { TabValue } from "@/shared/account-tabs";
import type { AccountManagementContext } from "@/shared/account-presentation";

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

export type TreeRow = Awaited<
  ReturnType<typeof getAccountTreeData>
>["rows"][number];

export const REFERENCE_CURRENCY_TOTAL_FOOTER_ROW_ID =
  "__reference_currency_total_footer__";

export type ReferenceCurrencyTotalFooterRow = {
  id: typeof REFERENCE_CURRENCY_TOTAL_FOOTER_ROW_ID;
  rowType: "referenceCurrencyTotalFooter";
  name: "Total";
  balanceInReferenceCurrency: number | null;
};

export type AccountsGridRow = TreeRow | ReferenceCurrencyTotalFooterRow;

export const ROOT_PARENT_KEY = "__root__";

export type RowTarget = {
  id: string;
  nodeType: "account" | "accountGroup";
  name: string;
};

export function toRowTarget(data: TreeRow): RowTarget {
  return {
    id: data.id,
    nodeType: data.nodeType,
    name: data.name,
  };
}

export function getEntityLabel(
  nodeType: RowTarget["nodeType"],
  context: AccountManagementContext = "accounts",
): string {
  if (context === "categories")
    return nodeType === "account" ? "Category" : "Category Group";
  return nodeType === "account" ? "Account" : "Group";
}

export function isReferenceCurrencyTotalFooterRow(
  row: AccountsGridRow | undefined,
): row is ReferenceCurrencyTotalFooterRow {
  return (
    !!row && "rowType" in row && row.rowType === "referenceCurrencyTotalFooter"
  );
}

function isTabValue(value: unknown): value is TabValue {
  return typeof value === "string" && tabs.some((tab) => tab.value === value);
}

export function parseAccountsSearch(search: Record<string, unknown>): {
  tab: TabValue;
  mode: AccountsMode;
  showArchived?: boolean;
} {
  const tab = isTabValue(search.tab) ? search.tab : "BALANCE";
  return {
    tab,
    ...(tab.startsWith("EQUITY-") && typeof search.showArchived === "boolean"
      ? { showArchived: search.showArchived }
      : {}),
    mode:
      tab.startsWith("EQUITY-") && search.mode === "archived"
        ? "archived"
        : "active",
  };
}
