import { AccountType, EquityAccountSubtype } from "../../.prisma-client/enums";
import type { getAccountTreeData } from "../../server/accounts";

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
  {
    value: `EQUITY-${EquityAccountSubtype.GAIN_LOSS}`,
    label: "Gain/Loss",
    type: AccountType.EQUITY,
    equityAccountSubtype: EquityAccountSubtype.GAIN_LOSS,
  },
] as const;

export type TabValue = (typeof tabs)[number]["value"];
export type AccountsMode = "active" | "archived";

export type TreeRow = Awaited<
  ReturnType<typeof getAccountTreeData>
>["rows"][number];

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
