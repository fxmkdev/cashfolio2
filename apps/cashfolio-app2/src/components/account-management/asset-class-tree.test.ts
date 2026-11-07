import { describe, expect, it } from "vitest";
import { buildUnifiedAccountTreeRows } from "@/shared/archived-account-tree-rows";
import { calculateBalanceInReferenceCurrencyByGroupId } from "./page-data";
import {
  buildAssetClassTree,
  assetClassRowId,
  unitRowId,
  archivedClassRowId,
  UNCLASSIFIED_ROW_ID,
} from "./asset-class-tree";
import type { TreeRow } from "./page-types";
import { account, chfUnitId, classes } from "./asset-class-test-fixtures";
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
        .filter((row) => row.parentId === chfUnitId("swiss"))
        .map((row) => row.id),
    ).toEqual(["a", "z"]);
    expect(projected.find((row) => row.id === "parent")?.parentId).toBe(
      chfUnitId("equities"),
    );
    expect(projected.find((row) => row.id === "stale")?.parentId).toBe(
      unitRowId(UNCLASSIFIED_ROW_ID, "CURRENCY:CHF"),
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
      parentId: chfUnitId("swiss"),
      accountGroupPath: ["Bank", "Broker"],
      groupId: "broker",
      persistedParentId: "broker",
      unarchiveDisabledReason: "Original constraint",
      sortOrder: 2,
    });
    expect(projected.find((row) => row.id === "active")).toMatchObject({
      parentId: chfUnitId("equities"),
      accountGroupPath: ["Bank", "Broker"],
    });
    expect(
      projected
        .filter((row) => row.presentationKind === "archived")
        .map((row) => row.parentId),
    ).toEqual(
      expect.arrayContaining([assetClassRowId("swiss"), UNCLASSIFIED_ROW_ID]),
    );
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
    expect(balances.get(chfUnitId("swiss"))?.sum).toBe(10);
  });

  it("groups by Report identities, keeps singleton and archived-only units, and orders subclasses before units", () => {
    const rows = buildAssetClassTree(
      [
        account("aapl-usd", {
          unit: "SECURITY",
          symbol: "AAPL",
          tradeCurrency: "USD",
        }),
        account("aapl-eur", {
          unit: "SECURITY",
          symbol: " aapl ",
          tradeCurrency: "EUR",
        }),
        account("crypto", { unit: "CRYPTOCURRENCY", cryptocurrency: "BTC" }),
        account("currency", { currency: "BTC" }),
        account("managed-chf", { trackingMethod: "TOTAL_PORTFOLIO_VALUE" }),
        account("managed-usd", {
          currency: "USD",
          trackingMethod: "TOTAL_PORTFOLIO_VALUE",
        }),
        account("unknown", { unit: null }),
        account("archived-only", { currency: "USD", isActive: false }),
        account("parent", { assetClassId: "equities" }),
      ],
      classes,
    );
    expect(
      rows
        .filter((row) => row.parentId === assetClassRowId("swiss"))
        .map((row) => row.name),
    ).toEqual([
      "AAPL",
      "BTC",
      "BTC",
      "Total Value Accounts",
      "Unknown Unit",
      "Archived",
    ]);
    expect(rows.find((row) => row.id === "aapl-usd")?.parentId).toBe(
      rows.find((row) => row.id === "aapl-eur")?.parentId,
    );
    expect(rows.find((row) => row.id === "crypto")?.parentId).not.toBe(
      rows.find((row) => row.id === "currency")?.parentId,
    );
    expect(rows.find((row) => row.id === "managed-chf")?.parentId).toBe(
      rows.find((row) => row.id === "managed-usd")?.parentId,
    );
    const archivedOnlyUnit = unitRowId(
      assetClassRowId("swiss"),
      "CURRENCY:USD",
    );
    expect(rows.find((row) => row.id === "archived-only")?.parentId).toBe(
      archivedOnlyUnit,
    );
    expect(rows.find((row) => row.id === archivedOnlyUnit)?.parentId).toBe(
      archivedClassRowId(assetClassRowId("swiss")),
    );
    expect(
      rows
        .filter((row) => row.parentId === archivedOnlyUnit)
        .map((row) => row.presentationKind),
    ).toEqual([undefined]);
    expect(
      rows
        .filter((row) => row.parentId === assetClassRowId("equities"))
        .map((row) => row.id),
    ).toEqual([assetClassRowId("swiss"), chfUnitId("equities")]);
    expect(
      rows
        .filter((row) => row.presentationKind === "unit")
        .every((row) => row.balance === null && row.unit === null),
    ).toBe(true);
  });

  it.each(["swiss", "equities", null])(
    "shares one Archived branch for fully archived units assigned to %s",
    (assetClassId) => {
      const parentId = assetClassId
        ? assetClassRowId(assetClassId)
        : UNCLASSIFIED_ROW_ID;
      const archiveId = archivedClassRowId(parentId);
      const rows = buildAssetClassTree(
        [
          account("usd-z", { assetClassId, currency: "USD", isActive: false }),
          account("usd-a", { assetClassId, currency: "USD", isActive: false }),
          account("eur", { assetClassId, currency: "EUR", isActive: false }),
          account("active", { assetClassId }),
          account("mixed-old", { assetClassId, isActive: false }),
        ],
        classes,
      );
      expect(rows.filter((row) => row.id === archiveId)).toHaveLength(1);
      expect(rows.find((row) => row.id === archiveId)).toMatchObject({
        parentId,
        presentationKind: "archived",
        isVirtualArchivedGroup: true,
      });
      expect(
        rows.filter((row) => row.parentId === archiveId).map((row) => row.name),
      ).toEqual(["EUR", "USD"]);
      const usdId = unitRowId(parentId, "CURRENCY:USD");
      expect(
        rows.filter((row) => row.parentId === usdId).map((row) => row.id),
      ).toEqual(["usd-a", "usd-z"]);
      expect(rows.some((row) => row.id === archivedClassRowId(usdId))).toBe(
        false,
      );
      const chfId = unitRowId(parentId, "CURRENCY:CHF");
      expect(rows.find((row) => row.id === chfId)?.parentId).toBe(parentId);
      expect(rows.find((row) => row.id === "mixed-old")?.parentId).toBe(
        archivedClassRowId(chfId),
      );
      expect(rows.filter((row) => row.nodeType === "account")).toHaveLength(5);
      expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length);
    },
  );

  it.each([
    { unit: "CURRENCY" as const, currency: "USD" },
    { unit: "CRYPTOCURRENCY" as const, cryptocurrency: "BTC" },
    { unit: "SECURITY" as const, symbol: "AEEM.PA" },
    { trackingMethod: "TOTAL_PORTFOLIO_VALUE" as const },
    { unit: null },
  ])(
    "reparents $unit units across archive transitions without changing IDs",
    (identity) => {
      const project = (active: boolean, includeOld: boolean) =>
        buildAssetClassTree(
          [
            account("current", { ...identity, isActive: active }),
            ...(includeOld
              ? [account("old", { ...identity, isActive: false })]
              : []),
          ],
          classes,
        );
      const mixed = project(true, true);
      const unitId = mixed.find((row) => row.presentationKind === "unit")!.id;
      const classId = assetClassRowId("swiss");
      const classArchiveId = archivedClassRowId(classId);
      const unitArchiveId = archivedClassRowId(unitId);
      expect(mixed.find((row) => row.id === unitId)?.parentId).toBe(classId);
      expect(mixed.find((row) => row.id === "old")?.parentId).toBe(
        unitArchiveId,
      );
      expect(mixed.some((row) => row.id === classArchiveId)).toBe(false);

      const archived = project(false, true);
      expect(archived.find((row) => row.id === unitId)?.parentId).toBe(
        classArchiveId,
      );
      expect(
        archived.filter((row) => row.parentId === unitId).map((row) => row.id),
      ).toEqual(["current", "old"]);
      expect(archived.some((row) => row.id === unitArchiveId)).toBe(false);
      expect(
        archived.find((row) => row.id === assetClassRowId("swiss"))?.parentId,
      ).toBe(assetClassRowId("equities"));
      expect(project(true, true)).toEqual(mixed);

      const activeOnly = project(true, false);
      expect(activeOnly.find((row) => row.id === unitId)?.parentId).toBe(
        classId,
      );
      expect(
        activeOnly.some((row) => row.presentationKind === "archived"),
      ).toBe(false);
    },
  );

  it("retains zero, negative and unvalued accounts and their unit subtotal", () => {
    const source = [
      account("zero", { balanceInReferenceCurrency: 0 }),
      account("negative", { balanceInReferenceCurrency: -4 }),
      account("missing", { balanceInReferenceCurrency: null }),
    ];
    const rows = buildAssetClassTree(source, classes);
    expect(
      rows
        .filter((row) => row.nodeType === "account")
        .map((row) => row.id)
        .sort(),
    ).toEqual(["missing", "negative", "zero"]);
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
    expect(balances.get(chfUnitId("swiss"))).toEqual({
      sum: -4,
      hasAccountDescendants: true,
      hasMissingReferenceBalance: true,
    });
    expect(balances.get(assetClassRowId("equities"))).toEqual(
      balances.get(chfUnitId("swiss")),
    );
  });

  it("keeps unit IDs stable across renames and reordering, and scopes identical units by class", () => {
    const source = [account("a"), account("b", { assetClassId: "equities" })];
    const first = buildAssetClassTree(source, classes);
    const second = buildAssetClassTree(
      [...source].reverse().map((row) => ({
        ...row,
        name: `Renamed ${row.id}`,
        currency: " chf ",
      })),
      classes.map((node) => ({
        ...node,
        name: `Renamed ${node.name}`,
        sortOrder: node.sortOrder + 1,
      })),
    );
    expect(
      first
        .filter((row) => row.presentationKind === "unit")
        .map((row) => row.id),
    ).toEqual(
      second
        .filter((row) => row.presentationKind === "unit")
        .map((row) => row.id),
    );
    expect(first.find((row) => row.id === "a")?.parentId).not.toBe(
      first.find((row) => row.id === "b")?.parentId,
    );
    const regrouped = buildAssetClassTree(
      source.map((row) => ({
        ...row,
        trackingMethod: "TOTAL_PORTFOLIO_VALUE",
      })),
      classes,
    );
    expect(regrouped.find((row) => row.id === "a")?.parentId).toBe(
      unitRowId(assetClassRowId("swiss"), "managed-portfolios"),
    );
    expect(regrouped.some((row) => row.id === chfUnitId("swiss"))).toBe(false);
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
      balances.get(archivedClassRowId(chfUnitId("swiss")))
        ?.hasMissingReferenceBalance,
    ).toBe(true);
  });
});
