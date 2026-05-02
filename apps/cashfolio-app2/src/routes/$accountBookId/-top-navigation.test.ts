import { describe, expect, test } from "vitest";
import { getAccountBookTopNavigationSection } from "./-top-navigation";

describe("account-book top navigation", () => {
  const accountBookId = "book-1";

  test("highlights period for period routes", () => {
    expect(
      getAccountBookTopNavigationSection({
        accountBookId,
        pathname: "/book-1/period",
      }),
    ).toBe("period");

    expect(
      getAccountBookTopNavigationSection({
        accountBookId,
        pathname: "/book-1/period/gains-losses/account-1",
      }),
    ).toBe("period");
  });

  test("highlights timeline for timeline routes", () => {
    expect(
      getAccountBookTopNavigationSection({
        accountBookId,
        pathname: "/book-1/timeline",
      }),
    ).toBe("timeline");
  });

  test("highlights valuation cache for valuation-cache routes", () => {
    expect(
      getAccountBookTopNavigationSection({
        accountBookId,
        pathname: "/book-1/valuation-cache",
      }),
    ).toBe("valuation-cache");
  });

  test("defaults to accounts for ledger routes", () => {
    expect(
      getAccountBookTopNavigationSection({
        accountBookId,
        pathname: "/book-1/account-1",
      }),
    ).toBe("accounts");

    expect(
      getAccountBookTopNavigationSection({
        accountBookId,
        pathname: "/book-1/account-1/chart",
      }),
    ).toBe("accounts");
  });

  test("defaults to accounts outside account-book scope", () => {
    expect(
      getAccountBookTopNavigationSection({
        accountBookId,
        pathname: "/another-book/period",
      }),
    ).toBe("accounts");
  });
});
