import { describe, expect, it } from "vitest";
import { buildUnifiedAccountTreeRows } from "@/shared/archived-account-tree-rows";
import type { ClassificationNode } from "@/shared/asset-class";
import type { AccountGainLossSummaries } from "@/shared/account-gain-loss";
import { calculateBalanceInReferenceCurrencyByGroupId } from "./-page-data";
import {
  buildAssetClassTree,
  projectAssetClassGainLoss,
  assetClassRowId,
  archivedClassRowId,
  UNCLASSIFIED_ROW_ID,
} from "./-asset-class-tree";
import type { TreeRow } from "./-page-types";

function account(id: string, overrides: Partial<TreeRow> = {}): TreeRow {
  return {
    id,
    name: id,
    nodeType: "account",
    type: "BALANCE",
    equityAccountSubtype: null,
    unit: "CURRENCY",
    currency: "CHF",
    cryptocurrency: null,
    symbol: null,
    tradeCurrency: null,
    balance: 10,
    balanceInReferenceCurrency: 10,
    openingBalance: null,
    parentId: "broker",
    groupId: "broker",
    sortOrder: 2,
    isActive: true,
    deletable: true,
    deleteDisabledReason: undefined,
    archivable: true,
    archiveDisabledReason: undefined,
    unarchivable: false,
    unarchiveDisabledReason: "Original constraint",
    assetClassId: "swiss",
    ...overrides,
  };
}
const classes: ClassificationNode[] = [
  { id: "swiss", name: "Swiss", parentId: "equities", sortOrder: 0 },
  { id: "empty", name: "Empty", parentId: null, sortOrder: 0 },
  { id: "equities", name: "Equities", parentId: null, sortOrder: 2 },
  { id: "cash", name: "Cash", parentId: null, sortOrder: 1 },
];
const originalGroups = [
  account("bank", {
    nodeType: "accountGroup",
    groupId: undefined,
    parentId: undefined,
    name: "Bank",
  }),
  account("broker", {
    nodeType: "accountGroup",
    groupId: undefined,
    parentId: "bank",
    name: "Broker",
  }),
];

describe("asset class account projection", () => {
  it("keeps nested classes and direct parent assignments, prunes empty classes, and orders roots", () => {
    const projected = buildAssetClassTree(
      [
        ...originalGroups,
        account("z"),
        account("a"),
        account("parent", { assetClassId: "equities" }),
        account("cash-account", { assetClassId: "cash" }),
        account("missing", { assetClassId: null }),
        account("stale", { assetClassId: "deleted" }),
      ],
      classes,
    );
    expect(
      projected.filter((row) => !row.parentId).map((row) => row.id),
    ).toEqual([
      assetClassRowId("cash"),
      assetClassRowId("equities"),
      UNCLASSIFIED_ROW_ID,
    ]);
    expect(
      projected
        .filter((row) => row.parentId === assetClassRowId("swiss"))
        .map((row) => row.id),
    ).toEqual(["a", "z"]);
    expect(projected.find((row) => row.id === "parent")?.parentId).toBe(
      assetClassRowId("equities"),
    );
    expect(projected.find((row) => row.id === "stale")?.parentId).toBe(
      UNCLASSIFIED_ROW_ID,
    );
    expect(projected.some((row) => row.id === assetClassRowId("empty"))).toBe(
      false,
    );
    expect(
      projected
        .filter((row) => row.presentationKind)
        .every(
          (row) =>
            !row.deletable &&
            !row.archivable &&
            !row.unarchivable &&
            row.groupId === undefined,
        ),
    ).toBe(true);
    expect(buildAssetClassTree([], classes)).toEqual([]);
  });

  it("flattens archived groups, preserves persisted account metadata and paths, and includes every leaf once", () => {
    const original = [
      ...originalGroups.map((row) => ({ ...row, isActive: false })),
      account("old", { isActive: false }),
      account("active", { assetClassId: "equities" }),
      account("unclassified-old", {
        isActive: false,
        assetClassId: null,
        groupId: undefined,
        parentId: undefined,
      }),
    ];
    const projected = buildAssetClassTree(
      buildUnifiedAccountTreeRows(original),
      classes,
    );
    const old = projected.find((row) => row.id === "old")!;
    expect(old).toMatchObject({
      parentId: archivedClassRowId(assetClassRowId("swiss")),
      accountGroupPath: ["Bank", "Broker"],
      groupId: "broker",
      persistedParentId: "broker",
      unarchiveDisabledReason: "Original constraint",
      sortOrder: 2,
    });
    expect(projected.find((row) => row.id === "active")).toMatchObject({
      parentId: assetClassRowId("equities"),
      accountGroupPath: ["Bank", "Broker"],
    });
    expect(
      projected
        .filter((row) => row.presentationKind === "archived")
        .map((row) => row.parentId),
    ).toEqual([assetClassRowId("swiss"), UNCLASSIFIED_ROW_ID]);
    expect(
      projected
        .filter((row) => row.nodeType === "account")
        .map((row) => row.id)
        .sort(),
    ).toEqual(["active", "old", "unclassified-old"]);
    expect(original.find((row) => row.id === "old")?.parentId).toBe("broker");
    const children = new Map<string, TreeRow[]>();
    for (const row of projected)
      if (row.parentId)
        children.set(row.parentId, [
          ...(children.get(row.parentId) ?? []),
          row,
        ]);
    const balances = calculateBalanceInReferenceCurrencyByGroupId(
      children,
      projected,
    );
    expect(balances.get(assetClassRowId("equities"))).toEqual({
      sum: 20,
      hasAccountDescendants: true,
      hasMissingReferenceBalance: false,
    });
    expect(balances.get(UNCLASSIFIED_ROW_ID)?.sum).toBe(10);
  });

  it("propagates missing reference balances through class and archive ancestors", () => {
    const rows = buildAssetClassTree(
      [
        account("a", { balanceInReferenceCurrency: null, isActive: false }),
        account("b"),
      ],
      classes,
    );
    const children = new Map<string, TreeRow[]>();
    for (const row of rows)
      if (row.parentId)
        children.set(row.parentId, [
          ...(children.get(row.parentId) ?? []),
          row,
        ]);
    const balances = calculateBalanceInReferenceCurrencyByGroupId(
      children,
      rows,
    );
    expect(balances.get(assetClassRowId("equities"))).toMatchObject({
      sum: 10,
      hasMissingReferenceBalance: true,
    });
    expect(
      balances.get(archivedClassRowId(assetClassRowId("swiss")))
        ?.hasMissingReferenceBalance,
    ).toBe(true);
  });
});

describe("asset class gain/loss", () => {
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
      projected.rows.find(
        (row) => row.id === archivedClassRowId(assetClassRowId("swiss")),
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
