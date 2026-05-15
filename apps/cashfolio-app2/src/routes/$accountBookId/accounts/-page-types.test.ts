import { describe, expect, it } from "vitest";
import { EquityAccountSubtype } from "@/.prisma-client/enums";
import { getAccountsPageTitle, parseAccountsSearch, tabs } from "./-page-types";

describe("accounts page tab parsing", () => {
  it("does not expose the gain/loss tab", () => {
    expect(
      tabs.some(
        (tab) => tab.value === `EQUITY-${EquityAccountSubtype.GAIN_LOSS}`,
      ),
    ).toBe(false);
  });

  it("falls back to ASSET for stale gain/loss tab search params", () => {
    expect(
      parseAccountsSearch({
        tab: `EQUITY-${EquityAccountSubtype.GAIN_LOSS}`,
        mode: "active",
      }),
    ).toEqual({ tab: "ASSET", mode: "active" });
  });

  it("keeps supported equity tabs unchanged", () => {
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
});

describe("getAccountsPageTitle", () => {
  it("uses the active accounts heading for active mode", () => {
    expect(getAccountsPageTitle("active")).toBe("Accounts");
  });

  it("uses the archived accounts heading for archived mode", () => {
    expect(getAccountsPageTitle("archived")).toBe("Archived Accounts");
  });
});
