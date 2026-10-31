import { describe, expect, it } from "vitest";
import { buildUnifiedAccountTreeRows } from "@/shared/archived-account-tree-rows";
import { addGroupTrackingMethodSummaries } from "./-page-data-tracking-methods";
import type { TreeRow } from "./-page-types";

function account(id: string, overrides: Partial<TreeRow> = {}): TreeRow {
  return {
    id,
    nodeType: "account",
    name: id,
    type: "BALANCE",
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
    unit: null,
    currency: null,
    parentId,
  });
}

function summarize(rows: TreeRow[]) {
  const children = new Map<string, TreeRow[]>();
  for (const row of rows) {
    if (!row.parentId) continue;
    const siblings = children.get(row.parentId) ?? [];
    siblings.push(row);
    children.set(row.parentId, siblings);
  }
  return addGroupTrackingMethodSummaries(children, rows);
}

function summaries(rows: TreeRow[]) {
  return Object.fromEntries(
    summarize(rows)
      .filter((row) => row.nodeType === "accountGroup")
      .map((row) => [row.id, row.groupTrackingMethod]),
  );
}

describe("account group tracking method summaries", () => {
  it.each([
    [[undefined, "INDIVIDUAL_UNITS"], "INDIVIDUAL_UNITS"],
    [
      ["TOTAL_PORTFOLIO_VALUE", "TOTAL_PORTFOLIO_VALUE"],
      "TOTAL_PORTFOLIO_VALUE",
    ],
    [[undefined, "TOTAL_PORTFOLIO_VALUE"], "Mixed"],
  ] as const)(
    "summarizes %s through nested groups as %s",
    (methods, expected) => {
      expect(
        summaries([
          ...methods.map((trackingMethod, index) =>
            account(`a${index}`, { parentId: "nested", trackingMethod }),
          ),
          group("root"),
          group("nested", "root"),
          group("empty", "root"),
        ]),
      ).toEqual({ root: expected, nested: expected, empty: undefined });
    },
  );

  it("includes archived descendants and real archived groups through virtual wrappers", () => {
    expect(
      summaries(
        buildUnifiedAccountTreeRows([
          group("root"),
          account("active", { parentId: "root" }),
          account("archived", {
            parentId: "root",
            isActive: false,
            trackingMethod: "TOTAL_PORTFOLIO_VALUE",
          }),
          { ...group("closed", "root"), isActive: false },
          account("closed-child", {
            parentId: "closed",
            isActive: false,
            trackingMethod: "TOTAL_PORTFOLIO_VALUE",
          }),
        ]),
      ),
    ).toEqual({
      root: "Mixed",
      closed: "TOTAL_PORTFOLIO_VALUE",
      "__archived__:group:root": "TOTAL_PORTFOLIO_VALUE",
    });
  });

  it("recomputes after edits and moves, clearing stale group values without mutating accounts", () => {
    const a = account("a", { parentId: "source" });
    const original = summarize([
      group("source"),
      group("destination"),
      a,
      account("b", {
        parentId: "source",
        trackingMethod: "TOTAL_PORTFOLIO_VALUE",
      }),
    ]);
    expect(summaries(original)).toEqual({
      source: "Mixed",
      destination: undefined,
    });
    expect(original.find((row) => row.id === "a")).toBe(a);
    const edited = original.map((row) =>
      row.id === "b"
        ? { ...row, trackingMethod: "INDIVIDUAL_UNITS" as const }
        : row,
    );
    expect(summaries(edited)).toEqual({
      source: "INDIVIDUAL_UNITS",
      destination: undefined,
    });
    const moved = edited.map((row) =>
      row.nodeType === "account" ? { ...row, parentId: "destination" } : row,
    );
    expect(summaries(moved)).toEqual({
      source: undefined,
      destination: "INDIVIDUAL_UNITS",
    });
  });
});
