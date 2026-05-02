import { describe, expect, it } from "vitest";
import { AccountType, EquityAccountSubtype } from "@/.prisma-client/enums";
import { getAccountsLinkSearch, getActiveSection } from "./route";

describe("getActiveSection", () => {
  it("marks accounts section as active for accounts, ledger, and chart paths", () => {
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
    expect(
      getActiveSection({
        pathname: "/book-1/account-cash/chart",
        accountBookId,
      }),
    ).toBe("accounts");
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
            loaderData: {
              account: {
                type: AccountType.EQUITY,
                equityAccountSubtype: EquityAccountSubtype.EXPENSE,
                isActive: false,
              },
            },
          },
        ],
      }),
    ).toEqual({
      tab: "EQUITY-EXPENSE",
      mode: "archived",
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
