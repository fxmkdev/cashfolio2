import { describe, expect, test } from "vitest";
import {
  flattenBreakdownHierarchyRows,
  sumTopLevelBreakdownHierarchyAmount,
} from "./-breakdown-table-rows";
import type { BreakdownHierarchyNode } from "./-breakdown-drill";

describe("flattenBreakdownHierarchyRows", () => {
  test("flattens hierarchy nodes with parent-child ids", () => {
    const hierarchy: BreakdownHierarchyNode[] = [
      {
        id: "group:asset",
        label: "Assets",
        kind: "group",
        amount: 1400,
        children: [
          {
            id: "group:cash",
            label: "Cash",
            kind: "group",
            amount: 700,
            children: [
              {
                id: "account:checking",
                label: "Checking",
                kind: "account",
                amount: 700,
                children: [],
              },
            ],
          },
          {
            id: "account:brokerage",
            label: "Brokerage",
            kind: "account",
            amount: 700,
            children: [],
          },
        ],
      },
      {
        id: "account:standalone",
        label: "Standalone",
        kind: "account",
        amount: 100,
        children: [],
      },
    ];

    expect(flattenBreakdownHierarchyRows(hierarchy)).toEqual([
      {
        id: "group:asset",
        parentId: undefined,
        name: "Assets",
        kind: "group",
        value: 1400,
      },
      {
        id: "group:cash",
        parentId: "group:asset",
        name: "Cash",
        kind: "group",
        value: 700,
      },
      {
        id: "account:checking",
        parentId: "group:cash",
        name: "Checking",
        kind: "account",
        value: 700,
      },
      {
        id: "account:brokerage",
        parentId: "group:asset",
        name: "Brokerage",
        kind: "account",
        value: 700,
      },
      {
        id: "account:standalone",
        parentId: undefined,
        name: "Standalone",
        kind: "account",
        value: 100,
      },
    ]);
  });

  test("returns empty array for empty hierarchy", () => {
    expect(flattenBreakdownHierarchyRows([])).toEqual([]);
  });
});

describe("sumTopLevelBreakdownHierarchyAmount", () => {
  test("sums only top-level hierarchy amounts", () => {
    const hierarchy: BreakdownHierarchyNode[] = [
      {
        id: "group:asset",
        label: "Assets",
        kind: "group",
        amount: 1400,
        children: [
          {
            id: "group:cash",
            label: "Cash",
            kind: "group",
            amount: 700,
            children: [
              {
                id: "account:checking",
                label: "Checking",
                kind: "account",
                amount: 700,
                children: [],
              },
            ],
          },
        ],
      },
      {
        id: "account:standalone",
        label: "Standalone",
        kind: "account",
        amount: 100,
        children: [],
      },
    ];

    expect(sumTopLevelBreakdownHierarchyAmount(hierarchy)).toBe(1500);
  });

  test("returns zero for empty hierarchy", () => {
    expect(sumTopLevelBreakdownHierarchyAmount([])).toBe(0);
  });
});
