import { describe, expect, test } from "vitest";
import {
  createGroupPathResolver,
  createGroupPathSegmentsResolver,
  getGroupPath,
} from "./accounts-helpers";

describe("group path helpers", () => {
  const groups = [
    { id: "assets", name: "Assets", parentGroupId: null },
    { id: "bank", name: "Bank", parentGroupId: "assets" },
    { id: "savings", name: "Savings", parentGroupId: "bank" },
  ];

  test("resolves full group paths", () => {
    const resolvePath = createGroupPathResolver(groups);
    expect(resolvePath("savings")).toBe("Assets / Bank / Savings");
    expect(getGroupPath("bank", groups)).toBe("Assets / Bank");
  });

  test("returns unknown-group marker for missing groups", () => {
    const resolvePath = createGroupPathResolver(groups);
    expect(resolvePath("missing")).toBe("Unknown group missing");
  });

  test("includes unknown parent markers in nested paths", () => {
    const resolvePath = createGroupPathResolver([
      { id: "orphan", name: "Orphan", parentGroupId: "missing-parent" },
    ]);
    expect(resolvePath("orphan")).toBe("Unknown group missing-parent / Orphan");
  });

  test("returns path segments for breadcrumb rendering", () => {
    const resolvePathSegments = createGroupPathSegmentsResolver(groups);
    expect(resolvePathSegments("savings")).toEqual([
      "Assets",
      "Bank",
      "Savings",
    ]);
  });

  test("guards against cyclical group hierarchies", () => {
    const resolvePath = createGroupPathResolver([
      { id: "a", name: "A", parentGroupId: "b" },
      { id: "b", name: "B", parentGroupId: "a" },
    ]);
    expect(resolvePath("a")).toBe("Unknown group a / B / A");
  });
});
