import { describe, expect, it } from "vitest";
import {
  parseUserSettingsSearch,
  resolveUserSettingsReturnTarget,
} from "./-return-target";

const accountBooks = [
  { id: "book-1", name: "Household" },
  { id: "book-2", name: "Business" },
];

describe("parseUserSettingsSearch", () => {
  it("keeps non-empty return targets only", () => {
    expect(parseUserSettingsSearch({ returnTo: "/admin" })).toEqual({
      returnTo: "/admin",
    });
    expect(parseUserSettingsSearch({ returnTo: "" })).toEqual({});
    expect(parseUserSettingsSearch({ returnTo: 42 })).toEqual({});
  });
});

describe("resolveUserSettingsReturnTarget", () => {
  it("accepts admin paths", () => {
    expect(
      resolveUserSettingsReturnTarget({
        accountBooks,
        returnTo: "/admin",
      }),
    ).toEqual({ href: "/admin", label: "Back to Admin" });

    expect(
      resolveUserSettingsReturnTarget({
        accountBooks,
        returnTo: "/admin/audit?tab=users#top",
      }),
    ).toEqual({
      href: "/admin/audit?tab=users#top",
      label: "Back to Admin",
    });
  });

  it("accepts accessible account-book paths", () => {
    expect(
      resolveUserSettingsReturnTarget({
        accountBooks,
        returnTo: "/book-1/accounts?tab=ASSET&mode=active",
      }),
    ).toEqual({
      href: "/book-1/accounts?tab=ASSET&mode=active",
      label: "Back to Household",
    });
  });

  it("rejects external, protocol-relative, malformed, and inaccessible targets", () => {
    for (const returnTo of [
      "https://example.test/admin",
      "//example.test/admin",
      "/book-3/accounts",
      "/account-books/new",
      "%",
      undefined,
    ]) {
      expect(
        resolveUserSettingsReturnTarget({
          accountBooks,
          returnTo,
        }),
      ).toBeNull();
    }
  });
});
