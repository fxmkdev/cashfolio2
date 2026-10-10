import { toMoney } from "../../shared/money";
import { toNumericMoney } from "../money-boundary";
import { describe, expect, it } from "vitest";
import { buildSignedBreakdownHierarchyWithMeta } from "./period-helpers";

describe("signed breakdown hierarchy", () => {
  it.each([0, 0.004])(
    "keeps offsetting accounts when their group nets to %s",
    (netAmount) => {
      const result = buildSignedBreakdownHierarchyWithMeta({
        groupById: new Map([
          ["cash", { id: "cash", name: "Cash", parentGroupId: null }],
        ]),
        items: [
          {
            accountId: "receipts",
            accountName: "Receipts",
            groupId: "cash",
            amount: toMoney(100),
          },
          {
            accountId: "payments",
            accountName: "Payments",
            groupId: "cash",
            amount: toMoney(-100 + netAmount),
          },
        ],
      });

      expect(toNumericMoney(result)).toEqual({
        hierarchy: [
          {
            id: "group:cash",
            label: "Cash",
            kind: "group",
            amount: 0,
            children: [
              {
                id: "account:payments",
                label: "Payments",
                kind: "account",
                amount: -100,
                children: [],
              },
              {
                id: "account:receipts",
                label: "Receipts",
                kind: "account",
                amount: 100,
                children: [],
              },
            ],
          },
        ],
        hasHiddenAmountDiscrepancy: false,
        hiddenAmountDiscrepancyNodeIds: [],
      });
    },
  );

  it("keeps zero-net subgroups inside nonzero parents", () => {
    const result = buildSignedBreakdownHierarchyWithMeta({
      groupById: new Map([
        ["parent", { id: "parent", name: "Parent", parentGroupId: null }],
        ["cash", { id: "cash", name: "Cash", parentGroupId: "parent" }],
      ]),
      items: [
        {
          accountId: "a",
          accountName: "A",
          groupId: "cash",
          amount: toMoney(100),
        },
        {
          accountId: "b",
          accountName: "B",
          groupId: "cash",
          amount: toMoney(-100),
        },
        {
          accountId: "c",
          accountName: "C",
          groupId: "parent",
          amount: toMoney(25),
        },
      ],
    });

    expect(toNumericMoney(result.hierarchy)).toMatchObject([
      {
        id: "group:parent",
        amount: 25,
        children: [
          { id: "account:c", amount: 25 },
          {
            id: "group:cash",
            amount: 0,
            children: [
              { id: "account:a", amount: 100 },
              { id: "account:b", amount: -100 },
            ],
          },
        ],
      },
    ]);
    expect(toNumericMoney(result.hasHiddenAmountDiscrepancy)).toBe(false);
  });

  it("still prunes groups whose accounts all round to zero", () => {
    const result = buildSignedBreakdownHierarchyWithMeta({
      groupById: new Map([
        ["cash", { id: "cash", name: "Cash", parentGroupId: null }],
      ]),
      items: [
        {
          accountId: "a",
          accountName: "A",
          groupId: "cash",
          amount: toMoney(0.004),
        },
        {
          accountId: "b",
          accountName: "B",
          groupId: "cash",
          amount: toMoney(-0.004),
        },
      ],
    });

    expect(toNumericMoney(result.hierarchy)).toEqual([]);
  });
});
