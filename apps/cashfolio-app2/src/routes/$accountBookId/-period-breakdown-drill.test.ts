import { describe, expect, test } from "vitest";
import {
  clampBreakdownPath,
  getBreakdownDrillState,
  isBreakdownNodeDrillable,
  type BreakdownHierarchyNode,
} from "./-period-breakdown-drill";

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
