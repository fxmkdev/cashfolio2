import { describe, expect, it } from "vitest";
import { getHomeRedirectTarget } from "./-home-redirect";

describe("getHomeRedirectTarget", () => {
  it("redirects to the first accessible account book", () => {
    expect(getHomeRedirectTarget("account-book-1")).toEqual({
      to: "/$accountBookId",
      params: { accountBookId: "account-book-1" },
    });
  });

  it("redirects to account-book creation when no account book exists", () => {
    expect(getHomeRedirectTarget(null)).toEqual({
      to: "/account-books/new",
    });
  });
});
