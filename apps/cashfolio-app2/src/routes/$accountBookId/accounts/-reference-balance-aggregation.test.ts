import { describe, expect, it } from "vitest";
import { buildAssetClassTree, assetClassRowId } from "./-asset-class-tree";
import { account, classes } from "./-asset-class-test-fixtures";
import {
  calculateBalanceInReferenceCurrencyByGroupId,
  calculateReferenceCurrencyBalanceTotal,
} from "./-reference-balance-aggregation";
import type { TreeRow } from "./-page-types";

describe("reference balance precision", () => {
  it("preserves cents through nested units/classes and independently of leaf order", () => {
    const source = [
      account("large", { currency: "USD", balanceInReferenceCurrency: 1e15 }),
      account("cent", {
        currency: "USD",
        balanceInReferenceCurrency: 0.01,
        isActive: false,
      }),
      account("offset", {
        assetClassId: "equities",
        currency: "EUR",
        balanceInReferenceCurrency: -1e15,
      }),
    ];
    const projected = buildAssetClassTree(source, classes);
    const children = new Map<string, TreeRow[]>();
    for (const row of projected)
      if (row.parentId)
        children.set(row.parentId, [
          ...(children.get(row.parentId) ?? []),
          row,
        ]);
    const aggregation = calculateBalanceInReferenceCurrencyByGroupId(
      children,
      projected,
    );
    expect(aggregation.get(assetClassRowId("equities"))).toEqual({
      sum: 0.01,
      hasAccountDescendants: true,
      hasMissingReferenceBalance: false,
    });
    for (const rows of [source, [...source].reverse(), projected])
      expect(calculateReferenceCurrencyBalanceTotal(rows)).toBe(0.01);
  });

  it("withholds incomplete totals, ignores headings, and preserves empty totals", () => {
    expect(
      calculateReferenceCurrencyBalanceTotal([
        account("missing", { balanceInReferenceCurrency: null }),
      ]),
    ).toBeNull();
    expect(
      calculateReferenceCurrencyBalanceTotal([
        account("group", {
          nodeType: "accountGroup",
          balanceInReferenceCurrency: 100,
        }),
        account("leaf", { balanceInReferenceCurrency: 0.1 }),
        account("other", { balanceInReferenceCurrency: 0.2 }),
      ]),
    ).toBe(0.3);
    expect(calculateReferenceCurrencyBalanceTotal([])).toBe(0);
  });
});
