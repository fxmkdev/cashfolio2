import { describe, expect, test } from "vitest";
import {
  clampBreakdownPath,
  getBreakdownDrillState,
  isBreakdownNodeDrillable,
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
const gainsLossesHierarchy: BreakdownHierarchyNode[] = [
  {
    id: "group:gains-losses:fx",
    label: "FX",
    kind: "group",
    amount: 250,
    children: [
      {
        id: "account:fx:USD",
        label: "USD",
        kind: "account",
        amount: 250,
        children: [],
      },
    ],
  },
  {
    id: "group:gains-losses:cryptocurrency",
    label: "Cryptocurrency",
    kind: "group",
    amount: -100,
    children: [
      {
        id: "account:crypto:BTC",
        label: "BTC",
        kind: "account",
        amount: -100,
        children: [],
      },
    ],
  },
  {
    id: "group:gains-losses:security",
    label: "Security",
    kind: "group",
    amount: 75,
    children: [
      {
        id: "account:security:AAPL",
        label: "AAPL",
        kind: "account",
        amount: 75,
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

  test("supports gains/losses one-level drill with breadcrumb updates", () => {
    const state = getBreakdownDrillState({
      hierarchy: gainsLossesHierarchy,
      path: ["group:gains-losses:security"],
      rootLabel: "All Gains/Losses",
    });

    expect(state.clampedPath).toEqual(["group:gains-losses:security"]);
    expect(state.breadcrumbs).toEqual([
      { id: null, label: "All Gains/Losses" },
      { id: "group:gains-losses:security", label: "Security" },
    ]);
    expect(state.currentNodes).toEqual([
      {
        id: "account:security:AAPL",
        label: "AAPL",
        kind: "account",
        amount: 75,
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

describe("parseBreakdownAccountId", () => {
  test("parses account node ids", () => {
    expect(parseBreakdownAccountId("account:acc-1")).toBe("acc-1");
  });

  test("rejects non-account ids and empty account ids", () => {
    expect(parseBreakdownAccountId("group:expenses")).toBeNull();
    expect(parseBreakdownAccountId("account:")).toBeNull();
  });
});
