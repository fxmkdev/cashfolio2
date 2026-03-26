import { describe, expect, test, vi } from "vitest";

const findMany = vi.hoisted(() => vi.fn());

vi.mock("../prisma.server", () => ({
  prisma: {
    accountGroup: {
      findMany,
    },
  },
}));

import {
  createGroupPathResolver,
  createGroupPathSegmentsResolver,
  getGroupHierarchy,
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

  test("loads group hierarchy from prisma", async () => {
    findMany.mockResolvedValueOnce([
      { id: "assets", parentGroupId: null, isActive: true },
      { id: "bank", parentGroupId: "assets", isActive: true },
    ]);

    const result = await getGroupHierarchy("book-1");

    expect(findMany).toHaveBeenCalledWith({
      where: { accountBookId: "book-1" },
      select: { id: true, parentGroupId: true, isActive: true },
    });
    expect(result.get("assets")).toEqual({
      id: "assets",
      parentGroupId: null,
      isActive: true,
    });
    expect(result.get("bank")).toEqual({
      id: "bank",
      parentGroupId: "assets",
      isActive: true,
    });
  });
});
