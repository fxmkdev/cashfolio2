import { describe, expect, it } from "vitest";
import {
  projectArchivedAccountHierarchy,
  type ArchiveHierarchyNode,
} from "./archived-account-hierarchy";

const node = (
  id: string,
  parentId?: string,
  isActive = true,
  nodeType: ArchiveHierarchyNode["nodeType"] = "accountGroup",
): ArchiveHierarchyNode => ({ id, parentId, isActive, nodeType });

describe("archived account hierarchy projection", () => {
  it("creates only needed wrappers and keeps archived group subtrees intact without mutating inputs", () => {
    const nodes = [
      node("active"),
      node("nested", "active"),
      node("root-account", undefined, false, "account"),
      node("archived-empty", undefined, false),
      node("archived-group", "active", false),
      node("child", "archived-group", false),
      node("leaf", "child", false, "account"),
      node("nested-account", "nested", false, "account"),
      node("active-account", "active", true, "account"),
    ];
    const before = structuredClone(nodes);
    const projected = projectArchivedAccountHierarchy(nodes);
    expect(projected.archivedGroups).toEqual([
      { id: "__archived__:root", parentId: undefined },
      { id: "__archived__:group:active", parentId: "active" },
      { id: "__archived__:group:nested", parentId: "nested" },
    ]);
    expect(Object.fromEntries(projected.parentIdById)).toMatchObject({
      "root-account": "__archived__:root",
      "archived-empty": "__archived__:root",
      "archived-group": "__archived__:group:active",
      child: "archived-group",
      leaf: "child",
      "nested-account": "__archived__:group:nested",
      "active-account": "active",
    });
    expect(nodes).toEqual(before);
    expect(
      projectArchivedAccountHierarchy([...nodes].reverse()).parentIdById,
    ).toEqual(projected.parentIdById);
  });

  it("adds no virtual groups for an empty or entirely active hierarchy", () => {
    expect(projectArchivedAccountHierarchy([]).archivedGroups).toEqual([]);
    expect(
      projectArchivedAccountHierarchy([
        node("group"),
        node("account", "group", true, "account"),
      ]).archivedGroups,
    ).toEqual([]);
  });

  it("keeps an entire subtree intact even if an active descendant exists beneath an archived ancestor", () => {
    const result = projectArchivedAccountHierarchy([
      node("archived", undefined, false),
      node("active", "archived"),
      node("leaf", "active", false, "account"),
    ]);
    expect(result.archivedGroups).toHaveLength(1);
    expect(result.parentIdById.get("leaf")).toBe("active");
  });
});
