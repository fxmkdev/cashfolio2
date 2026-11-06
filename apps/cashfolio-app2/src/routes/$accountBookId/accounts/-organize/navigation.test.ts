import { describe, expect, it } from "vitest";
import {
  createOrganizeReturnTarget,
  getOrganizeReturnDelta,
} from "./navigation";

const normal = "/book/accounts?tab=BALANCE&mode=active";
const organized = `${normal}&organize=true`;
const target = createOrganizeReturnTarget("book", normal, 2)!;

describe("organizer return navigation", () => {
  it("returns to the adjacent scoped normal entry, including after reload/Forward", () => {
    expect(getOrganizeReturnDelta(target, "book", organized, 3)).toBe(-1);
    expect(
      getOrganizeReturnDelta(
        target,
        "book",
        "/book/accounts?organize=true&mode=active&tab=BALANCE",
        3,
      ),
    ).toBe(-1);
  });

  it("recognizes a normal Accounts origin that omits the optional active mode", () => {
    const target = createOrganizeReturnTarget(
      "book",
      "/book/accounts?tab=BALANCE",
      2,
    );
    expect(getOrganizeReturnDelta(target, "book", organized, 3)).toBe(-1);
  });

  it.each([
    undefined,
    null,
    {},
    { ...target, accountBookId: "other" },
    { ...target, href: "/other/accounts?tab=BALANCE&mode=active" },
    { ...target, href: "//example.com/book/accounts" },
    { ...target, href: "https://example.com/book/accounts" },
    { ...target, href: "/book/transactions" },
    { ...target, href: organized },
    { ...target, href: `${normal}&grouping=assetClass` },
    { ...target, href: "/book/accounts?tab=EQUITY-INCOME&mode=active" },
    { ...target, href: "/\\example.com/book/accounts" },
    { ...target, historyIndex: -1 },
    { ...target, historyIndex: "2" },
    { ...target, historyIndex: 1.5 },
    { ...target, historyIndex: 0 },
  ])("falls back to replacement for missing or invalid origin %j", (value) => {
    expect(getOrganizeReturnDelta(value, "book", organized, 3)).toBeUndefined();
  });

  it("rejects a reused marker on a different entry or changed Accounts URL", () => {
    expect(
      getOrganizeReturnDelta(target, "book", organized, 4),
    ).toBeUndefined();
    expect(getOrganizeReturnDelta(target, "book", normal, 3)).toBeUndefined();
    expect(
      getOrganizeReturnDelta(target, "book", `${organized}#different`, 3),
    ).toBeUndefined();
  });
});
