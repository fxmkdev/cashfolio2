import { describe, expect, test } from "vitest";
import { toMoney } from "../shared/money";
import { toNumericMoney } from "./money-boundary";
import {
  buildBreakdownHierarchy,
  buildBreakdownHierarchyWithMeta,
} from "./period.test-support";

describe("breakdown hierarchy", () => {
  const groupById = new Map([
    [
      "expenses",
      {
        id: "expenses",
        name: "Expenses",
        parentGroupId: null,
      },
    ],
    [
      "housing",
      {
        id: "housing",
        name: "Housing",
        parentGroupId: "expenses",
      },
    ],
    [
      "rent",
      {
        id: "rent",
        name: "Rent",
        parentGroupId: "housing",
      },
    ],
    [
      "food",
      {
        id: "food",
        name: "Food",
        parentGroupId: "expenses",
      },
    ],
  ]);

  test("builds nested hierarchy from group ancestry", () => {
    const hierarchy = buildBreakdownHierarchy({
      items: [
        {
          accountId: "account-rent",
          accountName: "Rent",
          groupId: "rent",
          amount: toMoney(1500),
        },
      ],
      groupById,
    });

    expect(toNumericMoney(hierarchy)).toEqual([
      {
        id: "group:expenses",
        label: "Expenses",
        kind: "group",
        amount: 1500,
        children: [
          {
            id: "group:housing",
            label: "Housing",
            kind: "group",
            amount: 1500,
            children: [
              {
                id: "group:rent",
                label: "Rent",
                kind: "group",
                amount: 1500,
                children: [
                  {
                    id: "account:account-rent",
                    label: "Rent",
                    kind: "account",
                    amount: 1500,
                    children: [],
                  },
                ],
              },
            ],
          },
        ],
      },
    ]);
  });

  test("includes ungrouped accounts at root", () => {
    const hierarchy = buildBreakdownHierarchy({
      items: [
        {
          accountId: "account-rent",
          accountName: "Rent",
          groupId: "rent",
          amount: toMoney(900),
        },
        {
          accountId: "account-misc",
          accountName: "Misc",
          groupId: null,
          amount: toMoney(100),
        },
      ],
      groupById,
    });

    expect(toNumericMoney(hierarchy.map((item) => item.id))).toEqual([
      "group:expenses",
      "account:account-misc",
    ]);
  });

  test("prunes non-positive branches after account-level accumulation", () => {
    const hierarchy = buildBreakdownHierarchy({
      items: [
        {
          accountId: "account-rent",
          accountName: "Rent",
          groupId: "rent",
          amount: toMoney(1000),
        },
        {
          accountId: "account-refund",
          accountName: "Refund",
          groupId: "rent",
          amount: toMoney(-1000),
        },
      ],
      groupById,
    });

    expect(toNumericMoney(hierarchy)).toEqual([]);
  });

  test("prunes tiny positive accounts that round to zero", () => {
    const hierarchy = buildBreakdownHierarchy({
      items: [
        {
          accountId: "account-tiny",
          accountName: "Tiny",
          groupId: "rent",
          amount: toMoney(0.004),
        },
      ],
      groupById,
    });

    expect(toNumericMoney(hierarchy)).toEqual([]);
  });

  test("prunes groups that have no visible children after leaf pruning", () => {
    const result = buildBreakdownHierarchyWithMeta({
      items: [
        {
          accountId: "account-tiny-a",
          accountName: "Tiny A",
          groupId: "rent",
          amount: toMoney(0.004),
        },
        {
          accountId: "account-tiny-b",
          accountName: "Tiny B",
          groupId: "rent",
          amount: toMoney(0.004),
        },
      ],
      groupById,
    });

    expect(toNumericMoney(result.hierarchy)).toEqual([]);
    expect(toNumericMoney(result.hasHiddenAmountDiscrepancy)).toBe(false);
    expect(toNumericMoney(result.hiddenAmountDiscrepancyNodeIds)).toEqual([]);
  });

  test("orders siblings by descending amount with deterministic tie-breakers", () => {
    const hierarchy = buildBreakdownHierarchy({
      items: [
        {
          accountId: "account-food",
          accountName: "Food Account",
          groupId: "food",
          amount: toMoney(100),
        },
        {
          accountId: "account-rent",
          accountName: "Rent Account",
          groupId: "rent",
          amount: toMoney(300),
        },
        {
          accountId: "account-travel",
          accountName: "Travel",
          groupId: null,
          amount: toMoney(100),
        },
      ],
      groupById,
    });

    expect(toNumericMoney(hierarchy.map((item) => item.id))).toEqual([
      "group:expenses",
      "account:account-travel",
    ]);
    expect(
      toNumericMoney(hierarchy[0]?.children.map((item) => item.id)),
    ).toEqual(["group:housing", "group:food"]);
  });

  test("flags hidden amount discrepancies when pruned leaves affect parent totals", () => {
    const result = buildBreakdownHierarchyWithMeta({
      items: [
        {
          accountId: "account-rent",
          accountName: "Rent",
          groupId: "rent",
          amount: toMoney(100),
        },
        {
          accountId: "account-refund",
          accountName: "Refund",
          groupId: "rent",
          amount: toMoney(-20),
        },
      ],
      groupById,
    });

    expect(toNumericMoney(result.hasHiddenAmountDiscrepancy)).toBe(true);
    expect(toNumericMoney(result.hiddenAmountDiscrepancyNodeIds)).toEqual([
      "group:expenses",
      "group:housing",
      "group:rent",
    ]);
    expect(toNumericMoney(result.hierarchy)).toEqual([
      {
        id: "group:expenses",
        label: "Expenses",
        kind: "group",
        amount: 80,
        children: [
          {
            id: "group:housing",
            label: "Housing",
            kind: "group",
            amount: 80,
            children: [
              {
                id: "group:rent",
                label: "Rent",
                kind: "group",
                amount: 80,
                children: [
                  {
                    id: "account:account-rent",
                    label: "Rent",
                    kind: "account",
                    amount: 100,
                    children: [],
                  },
                ],
              },
            ],
          },
        ],
      },
    ]);
  });

  test("returns discrepancy node IDs in deterministic sorted order", () => {
    const customGroupById = new Map([
      [
        "z-root",
        {
          id: "z-root",
          name: "Z Root",
          parentGroupId: null,
        },
      ],
      [
        "a-child",
        {
          id: "a-child",
          name: "A Child",
          parentGroupId: "z-root",
        },
      ],
    ]);

    const result = buildBreakdownHierarchyWithMeta({
      items: [
        {
          accountId: "positive",
          accountName: "Positive",
          groupId: "a-child",
          amount: toMoney(100),
        },
        {
          accountId: "negative",
          accountName: "Negative",
          groupId: "a-child",
          amount: toMoney(-25),
        },
      ],
      groupById: customGroupById,
    });

    expect(toNumericMoney(result.hasHiddenAmountDiscrepancy)).toBe(true);
    expect(toNumericMoney(result.hiddenAmountDiscrepancyNodeIds)).toEqual([
      "group:a-child",
      "group:z-root",
    ]);
  });

  test("keeps visible groups and flags discrepancy when rounded-to-zero children are hidden", () => {
    const result = buildBreakdownHierarchyWithMeta({
      items: [
        {
          accountId: "account-food",
          accountName: "Food",
          groupId: "food",
          amount: toMoney(10),
        },
        {
          accountId: "account-tiny-a",
          accountName: "Tiny A",
          groupId: "rent",
          amount: toMoney(0.004),
        },
        {
          accountId: "account-tiny-b",
          accountName: "Tiny B",
          groupId: "rent",
          amount: toMoney(0.004),
        },
      ],
      groupById,
    });

    expect(toNumericMoney(result.hierarchy)).toEqual([
      {
        id: "group:expenses",
        label: "Expenses",
        kind: "group",
        amount: 10.01,
        children: [
          {
            id: "group:food",
            label: "Food",
            kind: "group",
            amount: 10,
            children: [
              {
                id: "account:account-food",
                label: "Food",
                kind: "account",
                amount: 10,
                children: [],
              },
            ],
          },
        ],
      },
    ]);
    expect(toNumericMoney(result.hasHiddenAmountDiscrepancy)).toBe(true);
    expect(toNumericMoney(result.hiddenAmountDiscrepancyNodeIds)).toEqual([
      "group:expenses",
    ]);
  });

  test("does not flag discrepancies caused only by rounding distribution", () => {
    const result = buildBreakdownHierarchyWithMeta({
      items: [
        {
          accountId: "account-a",
          accountName: "A",
          groupId: "rent",
          amount: toMoney(0.005),
        },
        {
          accountId: "account-b",
          accountName: "B",
          groupId: "rent",
          amount: toMoney(0.005),
        },
      ],
      groupById,
    });

    expect(toNumericMoney(result.hasHiddenAmountDiscrepancy)).toBe(false);
    expect(toNumericMoney(result.hiddenAmountDiscrepancyNodeIds)).toEqual([]);
  });
});
