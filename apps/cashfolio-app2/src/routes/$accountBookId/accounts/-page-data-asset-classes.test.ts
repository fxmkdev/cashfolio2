import { describe, expect, it } from "vitest";
import { buildUnifiedAccountTreeRows } from "@/shared/archived-account-tree-rows";
import { addGroupAssetClassSummaries } from "./-page-data";
import type { GroupAssetClassSummary, TreeRow } from "./-page-types";

function account(id: string, overrides: Partial<TreeRow> = {}): TreeRow {
  return {
    id,
    nodeType: "account",
    name: id,
    type: "BALANCE",
    assetClass: "EQUITIES",
    equityAccountSubtype: null,
    unit: "CURRENCY",
    currency: "CHF",
    cryptocurrency: null,
    symbol: null,
    tradeCurrency: null,
    balance: 0,
    balanceInReferenceCurrency: 0,
    openingBalance: null,
    parentId: undefined,
    isActive: true,
    groupId: undefined,
    sortOrder: null,
    deletable: true,
    deleteDisabledReason: undefined,
    archivable: true,
    archiveDisabledReason: undefined,
    unarchivable: false,
    unarchiveDisabledReason: undefined,
    ...overrides,
  };
}

function group(id: string, parentId?: string): TreeRow {
  return account(id, {
    nodeType: "accountGroup",
    assetClass: undefined,
    unit: null,
    currency: null,
    parentId,
  });
}

function summarize(rows: TreeRow[]): TreeRow[] {
  const children = new Map<string, TreeRow[]>();
  for (const row of rows) {
    if (!row.parentId) continue;
    const siblings = children.get(row.parentId) ?? [];
    siblings.push(row);
    children.set(row.parentId, siblings);
  }
  return addGroupAssetClassSummaries(children, rows);
}

function groupSummaries(rows: TreeRow[]) {
  return Object.fromEntries(
    summarize(rows)
      .filter((row) => row.nodeType === "accountGroup")
      .map((row) => [row.id, row.groupAssetClass]),
  );
}

describe("account group asset class summaries", () => {
  it("summarizes direct and nested accounts regardless of row order", () => {
    const rows = [
      account("nested-account", { parentId: "nested" }),
      group("root"),
      group("nested", "root"),
      account("direct-account", { parentId: "root" }),
    ];
    expect(groupSummaries(rows)).toEqual({
      root: "EQUITIES",
      nested: "EQUITIES",
    });
    expect(rows[1].groupAssetClass).toBeUndefined();
    expect(summarize(rows)[0]).toBe(rows[0]);
  });

  it.each<{
    classes: TreeRow["assetClass"][];
    expected: GroupAssetClassSummary;
  }>([
    { classes: ["EQUITIES", "FIXED_INCOME"], expected: "Mixed" },
    { classes: [null, undefined], expected: null },
    { classes: ["EQUITIES", null], expected: "Mixed" },
    { classes: [undefined, "EQUITIES"], expected: "Mixed" },
  ])(
    "summarizes $classes as $expected and propagates to ancestors",
    ({ classes, expected }) => {
      expect(
        groupSummaries([
          group("root"),
          group("nested", "root"),
          ...classes.map((assetClass, index) =>
            account(`a${index}`, {
              parentId: "nested",
              assetClass,
            }),
          ),
        ]),
      ).toEqual({ root: expected, nested: expected });
    },
  );

  it("leaves empty groups blank and ignores them in parent summaries", () => {
    expect(
      groupSummaries([
        group("root"),
        group("empty", "root"),
        group("empty-nested", "empty"),
        group("standalone"),
        account("a", { parentId: "root" }),
      ]),
    ).toEqual({
      root: "EQUITIES",
      empty: undefined,
      "empty-nested": undefined,
      standalone: undefined,
    });
  });

  it("includes archived accounts and real archived groups through virtual wrappers", () => {
    const rows = buildUnifiedAccountTreeRows([
      group("root"),
      account("active", { parentId: "root" }),
      account("archived", {
        parentId: "root",
        isActive: false,
        assetClass: "FIXED_INCOME",
      }),
      { ...group("archived-group", "root"), isActive: false },
      account("archived-nested", {
        parentId: "archived-group",
        isActive: false,
        assetClass: "FIXED_INCOME",
      }),
    ]);
    expect(groupSummaries(rows)).toEqual({
      root: "Mixed",
      "archived-group": "FIXED_INCOME",
      "__archived__:group:root": "FIXED_INCOME",
    });
  });

  it("recomputes ancestor summaries after classification changes and moves, clearing stale values", () => {
    const original = summarize([
      group("source"),
      group("destination"),
      account("a", { parentId: "source" }),
      account("b", { parentId: "source", assetClass: "FIXED_INCOME" }),
    ]);
    expect(groupSummaries(original)).toEqual({
      source: "Mixed",
      destination: undefined,
    });
    const reclassified = original.map((row) =>
      row.id === "b" ? { ...row, assetClass: "EQUITIES" as const } : row,
    );
    expect(groupSummaries(reclassified)).toEqual({
      source: "EQUITIES",
      destination: undefined,
    });
    const moved = reclassified.map((row) =>
      row.nodeType === "account" ? { ...row, parentId: "destination" } : row,
    );
    expect(groupSummaries(moved)).toEqual({
      source: undefined,
      destination: "EQUITIES",
    });
  });
});
