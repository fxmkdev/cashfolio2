import { describe, expect, it } from "vitest";
import { EquityAccountSubtype } from "@/.prisma-client/enums";
import {
  getAccountsPageTitle,
  getEntityLabel,
  getManagementTabs,
  parseCategoriesSearch,
  parseAccountsSearch,
  tabs,
} from "./-page-types";

describe("accounts page tab parsing", () => {
  it("does not expose the gain/loss tab", () => {
    expect(
      tabs.some(
        (tab) => tab.value === `EQUITY-${EquityAccountSubtype.GAIN_LOSS}`,
      ),
    ).toBe(false);
  });

  it("falls back to BALANCE for stale gain/loss tab search params", () => {
    expect(
      parseAccountsSearch({
        tab: `EQUITY-${EquityAccountSubtype.GAIN_LOSS}`,
        mode: "active",
      }),
    ).toEqual({ tab: "BALANCE", mode: "active" });
  });

  it("preserves legacy category tab and archive selection for its redirect", () => {
    expect(
      parseAccountsSearch({
        tab: `EQUITY-${EquityAccountSubtype.EXPENSE}`,
        mode: "archived",
      }),
    ).toEqual({
      tab: `EQUITY-${EquityAccountSubtype.EXPENSE}`,
      mode: "archived",
    });
  });

  it.each(["ASSET", "LIABILITY", "unknown"])(
    "normalizes archived mode to the combined Accounts view for %s",
    (tab) => {
      expect(parseAccountsSearch({ tab, mode: "archived" })).toEqual({
        tab: "BALANCE",
        mode: "active",
      });
    },
  );
});

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
      "Category Archive",
    );
    expect(getEntityLabel("account", "categories")).toBe("Category");
    expect(getEntityLabel("accountGroup", "categories")).toBe("Category Group");
  });

  it.each([
    undefined,
    "ASSET",
    "LIABILITY",
    "EQUITY-GAIN_LOSS",
    "EQUITY-OPENING_BALANCES",
    "unknown",
  ])("defaults unsupported category tabs (%s) to Income", (tab) => {
    expect(parseCategoriesSearch({ tab })).toEqual({
      tab: "EQUITY-INCOME",
      mode: "active",
    });
  });

  it("preserves category archive selection", () => {
    expect(
      parseCategoriesSearch({ tab: "EQUITY-EXPENSE", mode: "archived" }),
    ).toEqual({ tab: "EQUITY-EXPENSE", mode: "archived" });
  });
  it("uses the active accounts heading for active mode", () => {
    expect(getAccountsPageTitle("active")).toBe("Accounts");
  });

  it("uses the Accounts heading for legacy archived mode", () => {
    expect(getAccountsPageTitle("archived")).toBe("Accounts");
  });
});
