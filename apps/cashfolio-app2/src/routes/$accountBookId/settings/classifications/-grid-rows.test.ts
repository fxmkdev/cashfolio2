import { describe, expect, it } from "vitest";
import { buildAssetClassGridRows } from "./-grid-rows";
import type { ManagedClass } from "./-class-dialog";
const nodes: ManagedClass[] = [
  {
    id: "child",
    name: "Swiss Equities",
    parentId: "equities",
    sortOrder: 0,
    activeCount: 3,
    archivedCount: 2,
  },
  {
    id: "cash",
    name: "Cash",
    parentId: null,
    sortOrder: 1,
    activeCount: 4,
    archivedCount: 0,
  },
  {
    id: "equities",
    name: "Equities",
    parentId: null,
    sortOrder: 0,
    activeCount: 1,
    archivedCount: 0,
  },
];
describe("asset-class grid rows", () => {
  it("preserves manual sibling order and full paths without aggregating direct counts", () => {
    const rows = buildAssetClassGridRows(nodes);
    expect(rows.map((row) => row.id)).toEqual(["equities", "child", "cash"]);
    expect(rows[0]).toMatchObject({
      activeCount: 1,
      archivedCount: 0,
      hasChildren: true,
      canMoveUp: false,
      canMoveDown: true,
    });
    expect(rows[1]).toMatchObject({
      path: "Equities / Swiss Equities",
      activeCount: 3,
      archivedCount: 2,
      hasChildren: false,
      canMoveUp: false,
      canMoveDown: false,
    });
    expect(rows[2]).toMatchObject({ canMoveUp: true, canMoveDown: false });
  });
  it("reflects reordering and reparenting without changing class identities", () => {
    const rows = buildAssetClassGridRows(
      nodes.map((node) =>
        node.id === "equities"
          ? { ...node, sortOrder: 2 }
          : node.id === "child"
            ? { ...node, parentId: "cash" }
            : node,
      ),
    );
    expect(rows.map((row) => row.id)).toEqual(["cash", "child", "equities"]);
    expect(rows[1]?.path).toBe("Cash / Swiss Equities");
    expect(rows[2]?.hasChildren).toBe(false);
  });
  it("handles an empty taxonomy", () =>
    expect(buildAssetClassGridRows([])).toEqual([]));
});
