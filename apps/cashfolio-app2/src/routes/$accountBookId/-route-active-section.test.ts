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
      }),
    ).toBe("accounts");
  });

  it("marks activity section for activity routes", () => {
    expect(
      getActiveSection({
        pathname: "/book-1/activity",
        accountBookId: "book-1",
      }),
    ).toBe("activity");
  });

  it("marks period section as active for nested period routes", () => {
    expect(
      getActiveSection({
        pathname: "/book-1/period",
        accountBookId: "book-1",
      }),
    ).toBe("period");
    expect(
      getActiveSection({
        pathname: "/book-1/period/gains-losses/account-cash",
        accountBookId: "book-1",
      }),
    ).toBe("period");
  });

  it("marks timeline and valuation-cache sections for their top-level routes", () => {
    expect(
      getActiveSection({
        pathname: "/book-1/timeline",
        accountBookId: "book-1",
      }),
    ).toBe("timeline");
    expect(
      getActiveSection({
        pathname: "/book-1/valuation-cache",
        accountBookId: "book-1",
      }),
    ).toBe("valuation-cache");
  });

  it("marks settings section for account-book and user settings routes", () => {
    expect(
      getActiveSection({
        pathname: "/book-1/account-book-settings",
        accountBookId: "book-1",
      }),
    ).toBe("settings");
    expect(
      getActiveSection({
        pathname: "/book-1/user-settings",
        accountBookId: "book-1",
      }),
    ).toBe("settings");
  });
});

describe("getAccountsLinkSearch", () => {
  it("preserves explicit accounts search context when tab/mode are in the URL", () => {
    expect(
      getAccountsLinkSearch({
        locationSearch: { tab: "LIABILITY", mode: "archived" },
        matches: [],
      }),
    ).toEqual({
      tab: "LIABILITY",
      mode: "archived",
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
      tab: "EQUITY-EXPENSE",
      mode: "archived",
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
              type: AccountType.LIABILITY,
              equityAccountSubtype: null,
              isActive: true,
            },
          },
        ],
      }),
    ).toEqual({
      tab: "LIABILITY",
      mode: "active",
    });
  });

  it("keeps selected tab when mode is omitted and defaults mode to active", () => {
    expect(
      getAccountsLinkSearch({
        locationSearch: { tab: "LIABILITY" },
        matches: [],
      }),
    ).toEqual({
      tab: "LIABILITY",
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
      tab: "ASSET",
      mode: "active",
    });
  });
});
