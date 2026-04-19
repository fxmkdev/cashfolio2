import { describe, expect, test } from "vitest";
import { calculateBalanceInReferenceCurrencyByGroupId } from "./-accounts-page-data";
import type { TreeRow } from "./-accounts-page-types";

function createRowsByParentKey(rows: TreeRow[]): Map<string, TreeRow[]> {
  const map = new Map<string, TreeRow[]>();

  for (const row of rows) {
    const parentId = row.parentId ?? "__ROOT__";
    const siblings = map.get(parentId) ?? [];
    siblings.push(row);
    map.set(parentId, siblings);
  }

  return map;
}

describe("calculateBalanceInReferenceCurrencyByGroupId", () => {
  test("aggregates mixed nested groups and propagates missing descendant flags", () => {
    const rows = [
      {
        id: "g1",
        nodeType: "accountGroup",
        name: "Root",
        type: "ASSET",
        equityAccountSubtype: null,
        unit: null,
        currency: null,
        cryptocurrency: null,
        symbol: null,
        tradeCurrency: null,
        balance: null,
        balanceInReferenceCurrency: null,
        parentId: undefined,
        isActive: true,
        groupId: "g1",
        sortOrder: 0,
        deletable: true,
        deleteDisabledReason: undefined,
        archivable: true,
        archiveDisabledReason: undefined,
        unarchivable: false,
        unarchiveDisabledReason: undefined,
      },
      {
        id: "g2",
        nodeType: "accountGroup",
        name: "Child",
        type: "ASSET",
        equityAccountSubtype: null,
        unit: null,
        currency: null,
        cryptocurrency: null,
        symbol: null,
        tradeCurrency: null,
        balance: null,
        balanceInReferenceCurrency: null,
        parentId: "g1",
        isActive: true,
        groupId: "g2",
        sortOrder: 1,
        deletable: true,
        deleteDisabledReason: undefined,
        archivable: true,
        archiveDisabledReason: undefined,
        unarchivable: false,
        unarchiveDisabledReason: undefined,
      },
      {
        id: "a1",
        nodeType: "account",
        name: "Cash",
        type: "ASSET",
        equityAccountSubtype: null,
        unit: "CURRENCY",
        currency: "CHF",
        cryptocurrency: null,
        symbol: null,
        tradeCurrency: null,
        balance: 10,
        balanceInReferenceCurrency: 10,
        parentId: "g1",
        isActive: true,
        groupId: "g1",
        sortOrder: 0,
        deletable: true,
        deleteDisabledReason: undefined,
        archivable: true,
        archiveDisabledReason: undefined,
        unarchivable: false,
        unarchiveDisabledReason: undefined,
      },
      {
        id: "a2",
        nodeType: "account",
        name: "Savings",
        type: "ASSET",
        equityAccountSubtype: null,
        unit: "CURRENCY",
        currency: "USD",
        cryptocurrency: null,
        symbol: null,
        tradeCurrency: null,
        balance: 5,
        balanceInReferenceCurrency: 5,
        parentId: "g2",
        isActive: true,
        groupId: "g2",
        sortOrder: 0,
        deletable: true,
        deleteDisabledReason: undefined,
        archivable: true,
        archiveDisabledReason: undefined,
        unarchivable: false,
        unarchiveDisabledReason: undefined,
      },
      {
        id: "a3",
        nodeType: "account",
        name: "Missing Rate",
        type: "ASSET",
        equityAccountSubtype: null,
        unit: "CURRENCY",
        currency: "JPY",
        cryptocurrency: null,
        symbol: null,
        tradeCurrency: null,
        balance: 1,
        balanceInReferenceCurrency: null,
        parentId: "g2",
        isActive: true,
        groupId: "g2",
        sortOrder: 1,
        deletable: true,
        deleteDisabledReason: undefined,
        archivable: true,
        archiveDisabledReason: undefined,
        unarchivable: false,
        unarchiveDisabledReason: undefined,
      },
    ] satisfies TreeRow[];

    const result = calculateBalanceInReferenceCurrencyByGroupId(
      createRowsByParentKey(rows),
      rows,
      true,
    );

    expect(result.get("g2")).toEqual({
      sum: 5,
      hasAccountDescendants: true,
      hasMissingReferenceBalance: true,
    });
    expect(result.get("g1")).toEqual({
      sum: 15,
      hasAccountDescendants: true,
      hasMissingReferenceBalance: true,
    });
  });

  test("returns empty aggregation when disabled", () => {
    const result = calculateBalanceInReferenceCurrencyByGroupId(
      new Map(),
      [],
      false,
    );

    expect(result.size).toBe(0);
  });

  test("keeps hasAccountDescendants=false for groups without account descendants", () => {
    const rows = [
      {
        id: "g1",
        nodeType: "accountGroup",
        name: "Root",
        type: "ASSET",
        equityAccountSubtype: null,
        unit: null,
        currency: null,
        cryptocurrency: null,
        symbol: null,
        tradeCurrency: null,
        balance: null,
        balanceInReferenceCurrency: null,
        parentId: undefined,
        isActive: true,
        groupId: "g1",
        sortOrder: 0,
        deletable: true,
        deleteDisabledReason: undefined,
        archivable: true,
        archiveDisabledReason: undefined,
        unarchivable: false,
        unarchiveDisabledReason: undefined,
      },
      {
        id: "g2",
        nodeType: "accountGroup",
        name: "Child",
        type: "ASSET",
        equityAccountSubtype: null,
        unit: null,
        currency: null,
        cryptocurrency: null,
        symbol: null,
        tradeCurrency: null,
        balance: null,
        balanceInReferenceCurrency: null,
        parentId: "g1",
        isActive: true,
        groupId: "g2",
        sortOrder: 0,
        deletable: true,
        deleteDisabledReason: undefined,
        archivable: true,
        archiveDisabledReason: undefined,
        unarchivable: false,
        unarchiveDisabledReason: undefined,
      },
    ] satisfies TreeRow[];

    const result = calculateBalanceInReferenceCurrencyByGroupId(
      createRowsByParentKey(rows),
      rows,
      true,
    );

    expect(result.get("g2")).toEqual({
      sum: 0,
      hasAccountDescendants: false,
      hasMissingReferenceBalance: false,
    });
    expect(result.get("g1")).toEqual({
      sum: 0,
      hasAccountDescendants: false,
      hasMissingReferenceBalance: false,
    });
  });
});
