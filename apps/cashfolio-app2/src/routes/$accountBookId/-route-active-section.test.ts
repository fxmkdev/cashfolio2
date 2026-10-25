import { describe, expect, it } from "vitest";
import { AccountType, EquityAccountSubtype } from "@/.prisma-client/enums";
import {
  getAccountsLinkSearch,
  getActiveSection,
  parseDesktopRailCollapsedPreference,
} from "./-route-helpers";

describe("parseDesktopRailCollapsedPreference", () => {
  it("defaults to expanded unless the stored preference is explicitly collapsed", () => {
    expect(parseDesktopRailCollapsedPreference(null)).toBe(false);
    expect(parseDesktopRailCollapsedPreference("false")).toBe(false);
    expect(parseDesktopRailCollapsedPreference("invalid")).toBe(false);
    expect(parseDesktopRailCollapsedPreference("true")).toBe(true);
  });
});

describe("getActiveSection", () => {
  it("marks accounts section as active for accounts and ledger paths", () => {
    const accountBookId = "book-1";

    expect(
      getActiveSection({
        pathname: "/book-1/accounts",
        accountBookId,
      }),
    ).toBe("accounts");
    expect(
      getActiveSection({
        pathname: "/book-1/account-cash",
        accountBookId,
        matches: [
          {
            routeId: "/$accountBookId/$accountId",
            account: {
              id: "account-cash",
              type: AccountType.BALANCE,
              equityAccountSubtype: null,
              isActive: true,
            },
          },
        ],
      }),
    ).toBe("accounts");
  });

  it.each(Object.values(EquityAccountSubtype))(
    "leaves %s ledgers unselected",
    (equityAccountSubtype) => {
      expect(
        getActiveSection({
          pathname: "/book-1/equity",
          accountBookId: "book-1",
          matches: [
            {
              routeId: "/$accountBookId/$accountId",
              account: {
                id: "equity",
                type: AccountType.EQUITY,
                equityAccountSubtype,
                isActive: true,
              },
            },
          ],
        }),
      ).toBeNull();
    },
  );

  it("leaves unresolved and stale ledger data unselected", () => {
    expect(
      getActiveSection({ pathname: "/book-1/equity", accountBookId: "book-1" }),
    ).toBeNull();
    expect(
      getActiveSection({
        pathname: "/book-1/equity",
        accountBookId: "book-1",
        matches: [
          {
            routeId: "/$accountBookId/$accountId",
            account: {
              id: "cash",
              type: AccountType.BALANCE,
              equityAccountSubtype: null,
              isActive: true,
            },
          },
        ],
      }),
    ).toBeNull();
  });

  it("supports liability and nested ledger routes", () => {
    expect(
      getActiveSection({
        pathname: "/book-1/card/import-statement",
        accountBookId: "book-1",
        matches: [
          {
            routeId: "/$accountBookId/$accountId",
            account: {
              id: "card",
              type: AccountType.BALANCE,
              equityAccountSubtype: null,
              isActive: false,
            },
          },
        ],
      }),
    ).toBe("accounts");
  });

  it("marks transactions section for transactions routes", () => {
    expect(
      getActiveSection({
        pathname: "/book-1/transactions",
        accountBookId: "book-1",
      }),
    ).toBe("transactions");
  });

  it("marks report section as active for nested report routes", () => {
    expect(
      getActiveSection({
        pathname: "/book-1/report",
        accountBookId: "book-1",
      }),
    ).toBe("report");
    expect(
      getActiveSection({
        pathname: "/book-1/report/gains-losses/account-cash",
        accountBookId: "book-1",
      }),
    ).toBe("report");
  });

  it("marks history section for its top-level route", () => {
    expect(
      getActiveSection({
        pathname: "/book-1/history",
        accountBookId: "book-1",
      }),
    ).toBe("history");
  });

  it("marks settings section for the settings route", () => {
    expect(
      getActiveSection({
        pathname: "/book-1/settings",
        accountBookId: "book-1",
      }),
    ).toBe("settings");
  });
});

describe("getAccountsLinkSearch", () => {
  it("does not send the primary Accounts link into category settings", () => {
    expect(
      getAccountsLinkSearch({
        locationSearch: { tab: "EQUITY-INCOME", mode: "archived" },
        matches: [],
      }),
    ).toEqual({ tab: "BALANCE", mode: "active" });
    expect(
      getActiveSection({
        pathname: "/book-1/settings/categories",
        accountBookId: "book-1",
      }),
    ).toBe("settings");
  });
  it("preserves explicit accounts search context when tab/mode are in the URL", () => {
    expect(
      getAccountsLinkSearch({
        locationSearch: { tab: "BALANCE", mode: "archived" },
        matches: [],
      }),
    ).toEqual({
      tab: "BALANCE",
      mode: "active",
    });
  });

  it("derives accounts tab/mode from current ledger match when URL search has no accounts context", () => {
    expect(
      getAccountsLinkSearch({
        locationSearch: {},
        matches: [
          {
            routeId: "/$accountBookId/$accountId",
            account: {
              type: AccountType.EQUITY,
              equityAccountSubtype: EquityAccountSubtype.EXPENSE,
              isActive: false,
            },
          },
        ],
      }),
    ).toEqual({
      tab: "BALANCE",
      mode: "active",
    });
  });

  it("keeps compatibility with nested ledger route id form", () => {
    expect(
      getAccountsLinkSearch({
        locationSearch: {},
        matches: [
          {
            routeId: "/$accountId",
            account: {
              type: AccountType.BALANCE,
              equityAccountSubtype: null,
              isActive: true,
            },
          },
        ],
      }),
    ).toEqual({
      tab: "BALANCE",
      mode: "active",
    });
  });

  it("keeps selected tab when mode is omitted and defaults mode to active", () => {
    expect(
      getAccountsLinkSearch({
        locationSearch: { tab: "BALANCE" },
        matches: [],
      }),
    ).toEqual({
      tab: "BALANCE",
      mode: "active",
    });
  });

  it("falls back to default accounts context when no valid context is available", () => {
    expect(
      getAccountsLinkSearch({
        locationSearch: {},
        matches: [],
      }),
    ).toEqual({
      tab: "BALANCE",
      mode: "active",
    });
  });
});
