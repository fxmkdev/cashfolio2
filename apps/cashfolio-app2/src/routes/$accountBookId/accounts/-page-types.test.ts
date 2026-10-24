import { describe, expect, it } from "vitest";
import { EquityAccountSubtype } from "@/.prisma-client/enums";
import {
  getAccountsPageTitle,
  getCategoriesRedirect,
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
      "Income & Expense Categories",
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
      showArchived: false,
    });
  });

  it("preserves category archive selection", () => {
    expect(
      parseCategoriesSearch({ tab: "EQUITY-EXPENSE", mode: "archived" }),
    ).toEqual({ tab: "EQUITY-EXPENSE", showArchived: true });
  });
  it("uses the active accounts heading for active mode", () => {
    expect(getAccountsPageTitle("active")).toBe("Accounts");
  });

  it("uses the Accounts heading for legacy archived mode", () => {
    expect(getAccountsPageTitle("archived")).toBe("Accounts");
  });
});

describe("category visibility and legacy redirects", () => {
  it.each([undefined, false, null, "true", 1, "invalid"])(
    "hides archived by default for %s",
    (showArchived) => {
      expect(parseCategoriesSearch({ showArchived })).toEqual({
        tab: "EQUITY-INCOME",
        showArchived: false,
      });
    },
  );
  it.each([false, true])(
    "preserves explicit visibility %s over legacy mode",
    (showArchived) => {
      expect(
        getCategoriesRedirect({
          tab: "EQUITY-EXPENSE",
          showArchived,
          mode: "archived",
        }),
      ).toEqual({
        to: "/$accountBookId/settings/categories",
        search: { tab: "EQUITY-EXPENSE", showArchived },
        replace: true,
      });
      expect(
        getCategoriesRedirect(
          parseAccountsSearch({
            tab: "EQUITY-EXPENSE",
            showArchived,
            mode: "archived",
          }),
        ).search.showArchived,
      ).toBe(showArchived);
    },
  );
  it.each(["active", "archived"])(
    "converts legacy category mode %s",
    (mode) => {
      expect(
        getCategoriesRedirect(
          parseAccountsSearch({ tab: "EQUITY-INCOME", mode }),
        ),
      ).toEqual({
        to: "/$accountBookId/settings/categories",
        search: { tab: "EQUITY-INCOME", showArchived: mode === "archived" },
        replace: true,
      });
    },
  );
});
