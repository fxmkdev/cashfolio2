import { describe, expect, it } from "vitest";
import { planAssetClassMove, planOrganizeMove } from "./move";
import { compareOrganizeNodes, normalizeOrganizeSelection } from "./tree";
import type { AssetClassOrganizeNode } from "./types";

const node = (
  id: string,
  parentId: string | null,
  sortOrder: number,
): AssetClassOrganizeNode => ({
  id,
  name: id,
  parentId,
  sortOrder,
  nodeType: "assetClass",
  activeCount: 0,
  archivedCount: 0,
});
const nodes = [
  node("a", null, 0),
  node("b", null, 1),
  node("c", null, 2),
  node("child", "a", 0),
  node("grandchild", "child", 0),
];
const roots = (items: AssetClassOrganizeNode[]) =>
  items
    .filter((node) => node.parentId === null)
    .sort(compareOrganizeNodes)
    .map((node) => node.id);
describe("shared hierarchy movement", () => {
  it.each([
    ["first", undefined, ["c", "a", "b"]],
    ["last", undefined, ["a", "b", "c"]],
    ["before", "b", ["a", "c", "b"]],
    ["after", "a", ["a", "c", "b"]],
  ] as const)("supports %s placement", (placement, anchorId, expected) => {
    expect(
      roots(
        planAssetClassMove(nodes, {
          items: [nodes[2]],
          parentId: null,
          placement,
          anchorId,
        }),
      ),
    ).toEqual(expected);
  });
  it("normalizes nested selection and carries the complete subtree intact", () => {
    expect(
      normalizeOrganizeSelection(nodes, [nodes[4], nodes[0], nodes[3]]).map(
        (node) => node.id,
      ),
    ).toEqual(["a"]);
    const next = planAssetClassMove(nodes, {
      items: [nodes[4], nodes[0], nodes[3]],
      parentId: "b",
      placement: "last",
    });
    expect(next.find((node) => node.id === "a")?.parentId).toBe("b");
    expect(next.find((node) => node.id === "grandchild")?.parentId).toBe(
      "child",
    );
    expect(nodes[0].parentId).toBeNull();
  });
  it("allows a previously childless class to become a parent", () => {
    const next = planAssetClassMove(nodes, {
      items: [nodes[1]],
      parentId: "c",
      placement: "first",
    });
    expect(next[1].parentId).toBe("c");
  });
  it("retains the original snapshot for no-ops", () => {
    expect(
      planOrganizeMove(nodes, {
        items: [nodes[2]],
        parentId: null,
        placement: "last",
      }),
    ).toBe(nodes);
  });
  it("rejects cycles, duplicates, foreign items, and same-name destination siblings", () => {
    for (const items of [
      [nodes[0], nodes[0]],
      [{ id: "foreign", nodeType: "assetClass" as const }],
    ]) {
      expect(() =>
        planAssetClassMove(nodes, {
          items,
          parentId: null,
          placement: "first",
        }),
      ).toThrow();
    }
    expect(() =>
      planAssetClassMove(nodes, {
        items: [nodes[0]],
        parentId: "grandchild",
        placement: "last",
      }),
    ).toThrow("descendants");
    const duplicated = [...nodes, { ...node("duplicate", "b", 0), name: "a" }];
    expect(() =>
      planAssetClassMove(duplicated, {
        items: [nodes[0]],
        parentId: "b",
        placement: "last",
      }),
    ).toThrow("already exists");
  });
});
