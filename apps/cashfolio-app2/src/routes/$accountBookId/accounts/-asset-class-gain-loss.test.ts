import { describe, expect, it } from "vitest";
import type { AccountGainLossSummaries } from "@/shared/account-gain-loss";
import { projectAssetClassGainLoss } from "./-asset-class-gain-loss";
import {
  buildAssetClassTree,
  assetClassRowId,
  archivedClassRowId,
} from "./-asset-class-tree";
import { account, chfUnitId, classes } from "./-asset-class-test-fixtures";

const diagnostic = { date: "2026-01-01", message: "Valuation unavailable." };
const result = (
  id: string,
  realized: number | null,
  unrealized: number | null,
  applicable = true,
) => ({
  id,
  applicable,
  summary: {
    realizedGainLoss: realized,
    unrealizedGainLoss: unrealized,
    totalGainLoss:
      realized == null || unrealized == null ? null : realized + unrealized,
  },
  diagnostics: unrealized == null && applicable ? [diagnostic] : [],
});
const total = result("total", 100, 20);
const data: AccountGainLossSummaries = {
  referenceCurrency: "CHF",
  startDate: "2026-01-01",
  asOfDate: "2026-02-01",
  rows: [
    result("a", 0.1, 2),
    result("b", 0.2, null),
    result("c", null, null, false),
    result("broker", 9999, 9999),
  ],
  total,
};

describe("asset class gain/loss", () => {
  it("retains cents when large unit and subclass subtotals offset at a parent class", () => {
    const rows = buildAssetClassTree(
      [
        account("large", { currency: "USD" }),
        account("cent", { currency: "USD", isActive: false }),
        account("offset", { assetClassId: "equities", currency: "EUR" }),
      ],
      classes,
    );
    const data: AccountGainLossSummaries = {
      referenceCurrency: "CHF",
      startDate: "2026-01-01",
      asOfDate: "2026-02-01",
      rows: [
        result("large", 1e15, 0),
        result("cent", 0.01, 0),
        result("offset", -1e15, 0),
      ],
      total: result("total", 0.01, 0),
    };
    const projected = projectAssetClassGainLoss(data, rows)!;
    expect(
      projected.rows.find((row) => row.id === assetClassRowId("equities"))
        ?.summary,
    ).toEqual(data.total.summary);
    expect(projected.total).toBe(data.total);
  });

  it("uses leaves only, sums exactly, propagates partial components and diagnostics, and preserves total", () => {
    const rows = buildAssetClassTree(
      [account("a"), account("b", { isActive: false }), account("c")],
      classes,
    );
    const projected = projectAssetClassGainLoss(data, rows)!;
    expect(projected.total).toBe(total);
    expect(
      projected.rows.find((row) => row.id === assetClassRowId("equities")),
    ).toMatchObject({
      applicable: true,
      summary: {
        realizedGainLoss: 0.3,
        unrealizedGainLoss: null,
        totalGainLoss: null,
      },
      diagnostics: [diagnostic],
    });
    expect(
      projected.rows.find((row) => row.id === chfUnitId("swiss")),
    ).toMatchObject({
      summary: {
        realizedGainLoss: 0.3,
        unrealizedGainLoss: null,
        totalGainLoss: null,
      },
      diagnostics: [diagnostic],
    });
    expect(
      projected.rows.find(
        (row) => row.id === archivedClassRowId(chfUnitId("swiss")),
      )?.summary.realizedGainLoss,
    ).toBe(0.2);
    expect(projected.rows.find((row) => row.id === "a")).toEqual(data.rows[0]);
  });

  it("withholds missing leaf results and preserves all-inapplicable branches", () => {
    const rows = buildAssetClassTree(
      [
        account("a"),
        account("missing"),
        account("c", { assetClassId: "cash" }),
      ],
      classes,
    );
    const projected = projectAssetClassGainLoss(data, rows)!;
    expect(
      projected.rows.find((row) => row.id === assetClassRowId("equities"))
        ?.summary.realizedGainLoss,
    ).toBeNull();
    expect(
      projected.rows.find((row) => row.id === assetClassRowId("cash")),
    ).toMatchObject({ applicable: false, summary: { totalGainLoss: null } });
    expect(projectAssetClassGainLoss(undefined, rows)).toBeUndefined();
  });
});
