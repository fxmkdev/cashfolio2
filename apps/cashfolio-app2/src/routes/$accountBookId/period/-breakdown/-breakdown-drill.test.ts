import { describe, expect, test } from "vitest";
import {
  clampBreakdownPath,
  clampDrillTreePath,
  getBreakdownDrillState,
  getDrillTreeState,
  isBreakdownNodeDrillable,
  isDrillTreeNodeDrillable,
  parseBreakdownAccountId,
  type BreakdownHierarchyNode,
} from "./-breakdown-drill";

const hierarchy: BreakdownHierarchyNode[] = [
  {
    id: "group:expenses",
    label: "Expenses",
    kind: "group",
    amount: 400,
    children: [
      {
        id: "group:housing",
        label: "Housing",
        kind: "group",
        amount: 300,
        children: [
          {
            id: "account:rent",
            label: "Rent",
            kind: "account",
            amount: 300,
            children: [],
          },
        ],
      },
      {
        id: "account:subscriptions",
        label: "Subscriptions",
        kind: "account",
        amount: 100,
        children: [],
      },
    ],
  },
];

describe("clampBreakdownPath", () => {
  test("keeps valid group path", () => {
    expect(
      clampBreakdownPath({
        hierarchy,
        path: ["group:expenses", "group:housing"],
      }),
    ).toEqual(["group:expenses", "group:housing"]);
  });

  test("drops trailing invalid segments", () => {
    expect(
      clampBreakdownPath({
        hierarchy,
        path: ["group:expenses", "group:missing", "group:housing"],
      }),
    ).toEqual(["group:expenses"]);
  });

  test("stops at account leaves", () => {
    expect(
      clampBreakdownPath({
        hierarchy,
        path: ["group:expenses", "account:subscriptions"],
      }),
    ).toEqual(["group:expenses"]);
  });
});

describe("getBreakdownDrillState", () => {
  test("returns current nodes and breadcrumbs for clamped path", () => {
    const state = getBreakdownDrillState({
      hierarchy,
      path: ["group:expenses", "group:housing"],
      rootLabel: "All Expenses",
    });

    expect(state.breadcrumbs).toEqual([
      { id: null, label: "All Expenses" },
      { id: "group:expenses", label: "Expenses" },
      { id: "group:housing", label: "Housing" },
    ]);
    expect(state.currentNodes).toEqual([
      {
        id: "account:rent",
        label: "Rent",
        kind: "account",
        amount: 300,
        children: [],
      },
    ]);
  });
});

describe("isBreakdownNodeDrillable", () => {
  test("accepts non-empty groups and rejects accounts", () => {
    expect(
      isBreakdownNodeDrillable({
        id: "group:expenses",
        label: "Expenses",
        kind: "group",
        amount: 100,
        children: [
          {
            id: "account:a",
            label: "A",
            kind: "account",
            amount: 100,
            children: [],
          },
        ],
      }),
    ).toBe(true);

    expect(
      isBreakdownNodeDrillable({
        id: "account:a",
        label: "A",
        kind: "account",
        amount: 100,
        children: [],
      }),
    ).toBe(false);
  });
});

describe("generic drill tree helpers", () => {
  const genericHierarchy = [
    {
      id: "unit-type:fx",
      label: "FX",
      children: [
        {
          id: "unit:fx:USD",
          label: "USD",
          children: [
            {
              id: "account:usd-1",
              label: "USD 1",
              children: [],
            },
          ],
        },
      ],
    },
  ];

  test("treats non-empty nodes as drillable", () => {
    expect(isDrillTreeNodeDrillable(genericHierarchy[0]!)).toBe(true);
    expect(isDrillTreeNodeDrillable(genericHierarchy[0]!.children[0]!)).toBe(
      true,
    );
    expect(
      isDrillTreeNodeDrillable(genericHierarchy[0]!.children[0]!.children[0]!),
    ).toBe(false);
  });

  test("clamps generic paths using default drillability", () => {
    expect(
      clampDrillTreePath({
        hierarchy: genericHierarchy,
        path: ["unit-type:fx", "unit:fx:USD"],
      }),
    ).toEqual(["unit-type:fx", "unit:fx:USD"]);
    expect(
      clampDrillTreePath({
        hierarchy: genericHierarchy,
        path: ["unit-type:fx", "account:usd-1"],
      }),
    ).toEqual(["unit-type:fx"]);
  });

  test("returns breadcrumbs and current nodes for generic trees", () => {
    const state = getDrillTreeState({
      hierarchy: genericHierarchy,
      path: ["unit-type:fx"],
      rootLabel: "All Gains/Losses",
    });

    expect(state.breadcrumbs).toEqual([
      { id: null, label: "All Gains/Losses" },
      { id: "unit-type:fx", label: "FX" },
    ]);
    expect(state.currentNodes).toEqual([
      {
        id: "unit:fx:USD",
        label: "USD",
        children: [
          {
            id: "account:usd-1",
            label: "USD 1",
            children: [],
          },
        ],
      },
    ]);
  });
});

describe("parseBreakdownAccountId", () => {
  test("parses account node ids", () => {
    expect(parseBreakdownAccountId("account:acc-1")).toBe("acc-1");
  });

  test("rejects non-account ids and empty account ids", () => {
    expect(parseBreakdownAccountId("group:expenses")).toBeNull();
    expect(parseBreakdownAccountId("account:")).toBeNull();
  });
});
