import { describe, expect, it } from "vitest";
import { formatDocumentTitle } from "./document-title";

describe("formatDocumentTitle", () => {
  it("returns the app title when no page title is provided", () => {
    expect(formatDocumentTitle()).toBe("Cashfolio");
    expect(formatDocumentTitle(null)).toBe("Cashfolio");
    expect(formatDocumentTitle("   ")).toBe("Cashfolio");
  });

  it("suffixes page titles with a unicode middot and app title", () => {
    expect(formatDocumentTitle("Accounts")).toBe("Accounts · Cashfolio");
  });
});
