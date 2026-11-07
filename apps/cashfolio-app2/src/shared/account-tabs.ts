import { AccountType, EquityAccountSubtype } from "@/.prisma-client/enums";
import type { AccountManagementContext } from "./account-presentation";

export type TabValue = "BALANCE" | `EQUITY-${EquityAccountSubtype}`;
export type AccountsMode = "active" | "archived";

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

export function getTabDefinition(tabValue: TabValue) {
  return tabs.find((tab) => tab.value === tabValue) ?? tabs[0];
}
