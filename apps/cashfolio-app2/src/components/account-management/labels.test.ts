import { describe, expect, it } from "vitest";
import { getManagementTabs } from "@/shared/accounts/account-tabs";
import { getAccountsPageTitle, getEntityLabel } from "./labels";

describe("getAccountsPageTitle", () => {
  it("separates editable category tabs from balance accounts and system accounts", () => {
    expect(getManagementTabs("accounts").map((tab) => tab.value)).toEqual([
      "BALANCE",
    ]);
    expect(getManagementTabs("categories").map((tab) => tab.value)).toEqual([
      "EQUITY-INCOME",
      "EQUITY-EXPENSE",
    ]);
    expect(getAccountsPageTitle("active", "categories")).toBe(
      "Income & Expense Categories",
    );
    expect(getAccountsPageTitle("archived", "categories")).toBe(
      "Income & Expense Categories",
    );
    expect(getEntityLabel("account", "categories")).toBe("Category");
    expect(getEntityLabel("accountGroup", "categories")).toBe("Category Group");
  });

  it("uses the active accounts heading for active mode", () => {
    expect(getAccountsPageTitle("active")).toBe("Accounts");
  });

  it("uses the Accounts heading for legacy archived mode", () => {
    expect(getAccountsPageTitle("archived")).toBe("Accounts");
  });
});
