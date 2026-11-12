import { describe, expect, it } from "vitest";
import {
  buildAssetClassTree,
  assetClassRowId,
  unitRowId,
  archivedClassRowId,
  UNCLASSIFIED_ROW_ID,
} from "./asset-class-tree";
import { account, classes } from "./asset-class-test-fixtures";

describe("archived asset class units", () => {
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
});

it.each(["swiss", "equities", null])(
  "matches return memberships to every displayed heading for %s",
  async (assetClassId) => {
    const { buildAccountReturnGroups } =
      await import("@/shared/accounts/account-return-groups");
    for (const isActive of [false, true]) {
      const leaves = [
        account("usd-a", { assetClassId, currency: "USD", isActive }),
        account("usd-old", { assetClassId, currency: "USD", isActive: false }),
        account("eur-old", { assetClassId, currency: "EUR", isActive: false }),
        account("active", { assetClassId }),
        account("mixed-old", { assetClassId, isActive: false }),
      ];
      const rows = buildAssetClassTree(leaves, classes);
      const memberships = buildAccountReturnGroups({
        accounts: leaves.map((a) => ({
          ...a,
          groupId: a.groupId ?? null,
          assetClassId: a.assetClassId ?? null,
          trackingMethod: a.trackingMethod ?? "INDIVIDUAL_UNITS",
        })),
        classes,
        groups: [],
        grouping: "assetClass",
      });
      const byId = new Map(rows.map((r) => [r.id, r]));
      for (const heading of rows.filter((r) => r.nodeType === "accountGroup")) {
        const descendants = leaves
          .filter((a) => {
            let row = byId.get(a.id);
            while (row?.parentId) {
              if (row.parentId === heading.id) return true;
              row = byId.get(row.parentId);
            }
            return false;
          })
          .map((a) => a.id)
          .sort();
        expect([...memberships.get(heading.id)!.accountIds].sort()).toEqual(
          descendants,
        );
      }
      expect([...memberships.keys()].sort()).toEqual(
        rows
          .filter((r) => r.nodeType === "accountGroup")
          .map((r) => r.id)
          .sort(),
      );
    }
  },
);
