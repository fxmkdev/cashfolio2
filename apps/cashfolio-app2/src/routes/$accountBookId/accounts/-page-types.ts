import { AccountType, EquityAccountSubtype } from "@/.prisma-client/enums";
import type { getAccountTreeData } from "@/server/accounts";
import type { TabValue } from "@/shared/account-tabs";

export const tabs = [
  { value: "ASSET", label: "Asset", type: AccountType.ASSET },
  { value: "LIABILITY", label: "Liability", type: AccountType.LIABILITY },
  {
    value: `EQUITY-${EquityAccountSubtype.INCOME}`,
    label: "Income",
    type: AccountType.EQUITY,
    equityAccountSubtype: EquityAccountSubtype.INCOME,
  },
  {
    value: `EQUITY-${EquityAccountSubtype.EXPENSE}`,
    label: "Expense",
    type: AccountType.EQUITY,
    equityAccountSubtype: EquityAccountSubtype.EXPENSE,
  },
] as const;

export type { TabValue };
export type AccountsMode = "active" | "archived";

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

export function getEntityLabel(nodeType: RowTarget["nodeType"]): string {
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
} {
  return {
    tab: isTabValue(search.tab) ? search.tab : "ASSET",
    mode: search.mode === "archived" ? "archived" : "active",
  };
}
