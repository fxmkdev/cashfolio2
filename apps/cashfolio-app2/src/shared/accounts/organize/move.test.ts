import { describe, expect, it, vi } from "vitest";
import { organizeChanges, planAccountMove, validateOrganizeTree } from "./move";
import {
  descendants,
  normalizeOrganizeSelection,
  organizeDisplayRows,
  organizePath,
} from "../../hierarchy-organize/tree";
import type { OrganizeMove, OrganizeNode } from "./types";

function node(id: string, overrides: Partial<OrganizeNode> = {}): OrganizeNode {
  return {
    id,
    nodeType: "accountGroup",
    name: id,
    parentId: null,
    sortOrder: null,
    isActive: true,
    isCashAccount: false,
    unit: null,
    ...overrides,
  };
}
function leaf(
  id: string,
  parentId: string | null = null,
  overrides: Partial<OrganizeNode> = {},
) {
  return node(id, {
    nodeType: "account",
    unit: "CURRENCY",
    parentId,
    ...overrides,
  });
}
function move(
  items: OrganizeNode[],
  overrides: Partial<OrganizeMove> = {},
): OrganizeMove {
  return { items, parentId: null, placement: "last", ...overrides };
}
const order = (nodes: OrganizeNode[], parentId: string | null) =>
  organizeDisplayRows(nodes)
    .filter((row) => (row.parentId ?? null) === parentId)
    .map((row) => row.id);

describe("structural account selection", () => {
  it("uses the same fallback collation for previews and server moves", () => {
    const international = [
      node("z", { name: "Z" }),
      node("accent", { name: "Ä" }),
      node("a", { name: "A" }),
    ];
    const original = String.prototype.localeCompare;
    const hostLocale = vi
      .spyOn(String.prototype, "localeCompare")
      .mockImplementation(function (this: string, other, locale, options) {
        return original.call(this, other, locale ?? "sv-SE", options);
      });
    try {
      expect(organizeDisplayRows(international).map((row) => row.id)).toEqual([
        "a",
        "accent",
        "z",
      ]);
      expect(
        normalizeOrganizeSelection(
          international,
          international.toReversed(),
        ).map((row) => row.id),
      ).toEqual(["a", "accent", "z"]);
    } finally {
      hostLocale.mockRestore();
    }
  });
  const nodes = [
    node("parent"),
    node("child", { parentId: "parent" }),
    leaf("active", "child"),
    leaf("archived", "child", { isActive: false }),
    node("empty"),
  ];
  it("selects real groups including empty groups without selecting descendant accounts", () => {
    expect(
      normalizeOrganizeSelection(nodes, [nodes[0], nodes[4]]).map((n) => n.id),
    ).toEqual(["empty", "parent"]);
    expect(descendants(nodes, "parent")).toEqual(
      new Set(["parent", "child", "active", "archived"]),
    );
  });
  it("prunes selected descendants and orders independent roots by the displayed tree", () => {
    expect(
      normalizeOrganizeSelection(nodes, [
        nodes[3],
        nodes[2],
        nodes[0],
        nodes[4],
      ]).map((n) => n.id),
    ).toEqual(["empty", "parent"]);
  });
  it("rejects duplicate, foreign, incorrect-type and virtual references", () => {
    for (const items of [
      [nodes[0], nodes[0]],
      [node("missing")],
      [{ ...nodes[0], nodeType: "account" as const }],
      [node("__archived__:root")],
    ]) {
      expect(() => normalizeOrganizeSelection(nodes, items)).toThrow();
    }
  });
  it("renders archived items under their real parents and filters only their visibility", () => {
    const archived = organizeDisplayRows(nodes).find(
      (n) => n.id === "archived",
    )!;
    expect(archived.parentId).toBe("child");
    expect(organizeDisplayRows(nodes)).toHaveLength(nodes.length);
    expect(
      organizeDisplayRows(nodes, false).map((row) => row.id),
    ).not.toContain("archived");
    expect(descendants(nodes, "parent")).toContain("archived");
    expect(organizePath(nodes, "archived")).toBe("parent / child / archived");
  });
});

describe("account movement", () => {
  it("moves a whole subtree alongside an account without flattening nested or archived descendants", () => {
    const nodes = [
      node("a"),
      node("nested", { parentId: "a" }),
      leaf("inside", "nested", { isActive: false }),
      leaf("free"),
      node("destination"),
    ];
    const next = planAccountMove(
      nodes,
      move([nodes[2], nodes[3], nodes[0]], { parentId: "destination" }),
    );
    expect(next.map((n) => [n.id, n.parentId])).toEqual([
      ["a", "destination"],
      ["nested", "a"],
      ["inside", "nested"],
      ["free", "destination"],
      ["destination", null],
    ]);
    expect(order(next, "destination")).toEqual(["a", "free"]);
  });
  it.each(["first", "last", "before", "after"] as const)(
    "supports %s placement and preserves untouched sibling order",
    (placement) => {
      const nodes = [
        leaf("a", null, { sortOrder: 0 }),
        leaf("b", null, { sortOrder: 1 }),
        leaf("c", null, { sortOrder: 2 }),
        leaf("moved", "source"),
        node("source"),
      ];
      const next = planAccountMove(
        nodes,
        move([nodes[3]], { placement, anchorId: "b" }),
      );
      const expected = {
        first: ["moved", "a", "b", "c", "source"],
        last: ["a", "b", "c", "source", "moved"],
        before: ["a", "moved", "b", "c", "source"],
        after: ["a", "b", "moved", "c", "source"],
      };
      expect(order(next, null)).toEqual(expected[placement]);
    },
  );
  it("normalizes only the affected source and destination sibling orders", () => {
    const nodes = [
      node("s"),
      node("d"),
      node("untouched"),
      leaf("a", "s", { sortOrder: 20 }),
      leaf("b", "s", { sortOrder: 30 }),
      leaf("other", "untouched"),
    ];
    const next = planAccountMove(nodes, move([nodes[3]], { parentId: "d" }));
    expect(next.find((n) => n.id === "b")?.sortOrder).toBe(0);
    expect(next.find((n) => n.id === "other")?.sortOrder).toBeNull();
  });
  it("retains null orders for an effective no-op", () => {
    const nodes = [leaf("a"), leaf("b"), node("group"), leaf("child", "group")];
    expect(
      planAccountMove(nodes, move([nodes[0]], { placement: "first" })),
    ).toBe(nodes);
    expect(
      planAccountMove(nodes, move([nodes[3]], { parentId: "group" })),
    ).toBe(nodes);
  });
  it("moves to root and preserves cash flags", () => {
    const nodes = [
      node("cash", { isCashAccount: true }),
      leaf("a", "cash", { isCashAccount: true }),
    ];
    const next = planAccountMove(nodes, move([nodes[1]]));
    expect(next[1]).toMatchObject({ parentId: null, isCashAccount: true });
  });
  it("inherits destination cash flags throughout the subtree", () => {
    const nodes = [
      node("source"),
      node("child", { parentId: "source" }),
      leaf("archived", "child", { isActive: false }),
      node("cash", { isCashAccount: true }),
    ];
    const next = planAccountMove(nodes, move([nodes[0]], { parentId: "cash" }));
    expect(next.every((n) => n.isCashAccount)).toBe(true);
    expect(organizeChanges(nodes, next)).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: nodes[0].id })]),
    );
  });
  it("inserts mixed active/archived roots as a block beside a real sibling", () => {
    const nodes = [
      node("d"),
      leaf("a"),
      leaf("b", null, { isActive: false }),
      leaf("anchor", "d"),
    ];
    const next = planAccountMove(
      nodes,
      move([nodes[1], nodes[2]], { parentId: "d" }),
    );
    expect(next[1].parentId).toBe("d");
    expect(next[2].parentId).toBe("d");
    const relative = planAccountMove(
      nodes,
      move([nodes[1], nodes[2]], {
        parentId: "d",
        placement: "before",
        anchorId: "anchor",
      }),
    );
    expect(order(relative, "d")).toEqual(["a", "b", "anchor"]);
  });
  it("places items against full sibling boundaries without changing hidden siblings' relative order", () => {
    const nodes = [
      leaf("old1", null, { isActive: false, sortOrder: 0 }),
      leaf("active", null, { sortOrder: 1 }),
      leaf("old2", null, { isActive: false, sortOrder: 2 }),
      leaf("moved", null, { sortOrder: 3 }),
    ];
    const next = planAccountMove(
      nodes,
      move([nodes[3]], { placement: "before", anchorId: "active" }),
    );
    expect(order(next, null)).toEqual(["old1", "moved", "active", "old2"]);
    expect(organizeDisplayRows(next, false).map((row) => row.id)).toEqual([
      "moved",
      "active",
    ]);

    expect(
      planAccountMove(
        next,
        move([next[3]], { placement: "before", anchorId: "active" }),
      ),
    ).toBe(next);
    expect(
      order(
        planAccountMove(nodes, move([nodes[3]], { placement: "first" })),
        null,
      )[0],
    ).toBe("moved");
    expect(
      order(
        planAccountMove(nodes, move([nodes[1]], { placement: "last" })),
        null,
      ).at(-1),
    ).toBe("active");
  });
  it("reorders archived siblings using their real parent", () => {
    const nodes = [
      node("d"),
      leaf("a", "d", { isActive: false, sortOrder: 0 }),
      leaf("b", "d", { isActive: false, sortOrder: 1 }),
    ];
    const next = planAccountMove(
      nodes,
      move([nodes[2]], { parentId: "d", placement: "before", anchorId: "a" }),
    );
    expect(order(next, "d")).toEqual(["b", "a"]);
    expect(next.every((n) => !n.parentId?.startsWith("__archived__"))).toBe(
      true,
    );
  });
  it.each([
    [
      "self",
      (nodes: OrganizeNode[]) => move([nodes[0]], { parentId: "group" }),
    ],
    [
      "descendant",
      (nodes: OrganizeNode[]) => move([nodes[0]], { parentId: "child" }),
    ],
    [
      "account destination",
      (nodes: OrganizeNode[]) => move([nodes[0]], { parentId: "leaf" }),
    ],
    [
      "missing anchor",
      (nodes: OrganizeNode[]) =>
        move([nodes[2]], { placement: "before", anchorId: "missing" }),
    ],
    [
      "virtual destination",
      (nodes: OrganizeNode[]) =>
        move([nodes[2]], { parentId: "__archived__:root" }),
    ],
    ["empty selection", () => move([])],
  ] as const)("rejects %s", (_label, makeMove) => {
    const nodes = [
      node("group"),
      node("child", { parentId: "group" }),
      leaf("leaf"),
    ];
    expect(() => planAccountMove(nodes, makeMove(nodes))).toThrow();
  });
  it("rejects moving active items into archived groups", () => {
    const nodes = [node("archived", { isActive: false }), leaf("active")];
    expect(() =>
      planAccountMove(nodes, move([nodes[1]], { parentId: "archived" })),
    ).toThrow("archived group");
  });
  it("rejects cash destinations when any archived descendant is non-currency", () => {
    const nodes = [
      node("source"),
      leaf("security", "source", { unit: "SECURITY", isActive: false }),
      node("cash", { isCashAccount: true }),
    ];
    expect(() =>
      planAccountMove(nodes, move([nodes[0]], { parentId: "cash" })),
    ).toThrow("currency");
  });
  it("checks the final sibling set for case-insensitive name collisions", () => {
    const nodes = [
      node("d"),
      leaf("a", "d", { name: "Savings" }),
      leaf("b", null, { name: "savings" }),
    ];
    expect(() =>
      planAccountMove(nodes, move([nodes[2]], { parentId: "d" })),
    ).toThrow("already exists");
  });
  it("allows an account and group to have the same name under existing naming rules", () => {
    const nodes = [
      node("d"),
      node("g", { name: "Same", parentId: "d" }),
      leaf("a", null, { name: "Same" }),
    ];
    expect(
      planAccountMove(nodes, move([nodes[2]], { parentId: "d" }))[2].parentId,
    ).toBe("d");
  });
  it("validates resulting Cash Account rules", () => {
    expect(() =>
      validateOrganizeTree([
        node("cash", { isCashAccount: true }),
        leaf("a", "cash"),
      ]),
    ).toThrow("Cash Account");
  });
});
