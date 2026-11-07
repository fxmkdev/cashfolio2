import { describe, expect, it } from "vitest";
import {
  SET_FILTER_SPECIAL as special,
  setFilterEntityKey as key,
} from "@/components/grid/set-filter";
import { buildUnifiedAccountTreeRows } from "@/shared/archived-account-tree-rows";
import { buildAccountFilterContext } from "./account-filter-context";
import { addGroupAssetClassSummaries } from "./page-data";
import { addGroupTrackingMethodSummaries } from "./page-data-tracking-methods";
import { buildAssetClassTree } from "./asset-class-tree";
import { account, classes } from "./asset-class-test-fixtures";
import type { TreeRow } from "./page-types";

function summarize(rows: TreeRow[]) {
  const children = new Map<string, TreeRow[]>();
  for (const row of rows) {
    const parent = row.parentId ?? "__root__";
    children.set(parent, [...(children.get(parent) ?? []), row]);
  }
  return addGroupTrackingMethodSummaries(
    children,
    addGroupAssetClassSummaries(children, rows),
  );
}

const sourceRows = buildUnifiedAccountTreeRows([
  account("broker", {
    nodeType: "accountGroup",
    name: "Broker",
    groupId: "broker",
    parentId: undefined,
  }),
  account("nested", {
    nodeType: "accountGroup",
    name: "Nested",
    groupId: "nested",
  }),
  account("empty", {
    nodeType: "accountGroup",
    parentId: undefined,
    groupId: "empty",
  }),
  account("usd", {
    currency: "USD",
    assetClassId: "equities",
    trackingMethod: "TOTAL_PORTFOLIO_VALUE",
  }),
  account("archived", {
    parentId: "nested",
    groupId: "nested",
    isActive: false,
  }),
  account("unclassified", {
    parentId: undefined,
    groupId: undefined,
    assetClassId: null,
  }),
]);

describe("account filter context", () => {
  it("offers underlying currencies and meaningful special entries without group blanks", () => {
    const context = buildAccountFilterContext(
      sourceRows,
      summarize(sourceRows),
      classes,
    );
    expect(context.unitIdentifier.options.values).toEqual(["CHF", "USD"]);
    expect(context.unitIdentifier.valuesByAccountId.get("archived")).toEqual([
      "CHF",
    ]);
    expect(context.assetClass.options.values).toEqual([
      key("equities"),
      key("swiss"),
      special.unclassified,
      special.mixed,
    ]);
    expect(context.path.options.values).toEqual([
      key("broker"),
      key("nested"),
      special.topLevel,
    ]);
    expect(context.path.options.paths.get(key("broker"))).toEqual([
      key("broker"),
      special.direct,
    ]);
    expect(context.path.options.paths.get(key("nested"))).toEqual([
      key("broker"),
      key("nested"),
    ]);
    expect(context.trackingMethod.options.values).toEqual([
      "INDIVIDUAL_UNITS",
      "TOTAL_PORTFOLIO_VALUE",
      special.mixed,
    ]);
    for (const dimension of Object.values(context)) {
      expect(dimension.valuesByAccountId.has("empty")).toBe(false);
      expect(dimension.valuesByAccountId.has("broker")).toBe(false);
      expect(dimension.options.values).not.toContain(null);
    }
  });

  it("propagates Mixed membership from ancestors independently of column filters", () => {
    const context = buildAccountFilterContext(
      sourceRows,
      summarize(sourceRows),
      classes,
    );
    for (const id of ["usd", "archived"]) {
      expect(context.assetClass.valuesByAccountId.get(id)).toContain(
        special.mixed,
      );
      expect(context.trackingMethod.valuesByAccountId.get(id)).toContain(
        special.mixed,
      );
    }
    expect(context.assetClass.valuesByAccountId.get("unclassified")).toEqual([
      special.unclassified,
    ]);
    const mixedUsd = sourceRows.filter(
      (row) =>
        context.assetClass.valuesByAccountId
          .get(row.id)
          ?.includes(special.mixed) &&
        context.unitIdentifier.valuesByAccountId.get(row.id)?.includes("USD"),
    );
    expect(mixedUsd.map((row) => row.id)).toEqual(["usd"]);
  });

  it("preserves original group IDs through asset-class projection and archived branches", () => {
    const displayed = summarize(buildAssetClassTree(sourceRows, classes));
    const context = buildAccountFilterContext(sourceRows, displayed, classes);
    expect(context.path.valuesByAccountId.get("archived")).toEqual([
      key("nested"),
    ]);
    expect(context.path.options.paths.get(key("nested"))).toEqual([
      key("broker"),
      key("nested"),
    ]);
    expect(context.path.options.values).not.toContain(key("empty"));
    // The projected Equities ancestor is mixed even though Swiss itself is homogeneous.
    expect(context.trackingMethod.valuesByAccountId.get("archived")).toContain(
      special.mixed,
    );
    expect(
      context.trackingMethod.valuesByAccountId.get("unclassified"),
    ).not.toContain(special.mixed);
  });

  it("updates used options and Mixed membership after assignments change", () => {
    const changed = sourceRows.map((row) =>
      row.nodeType === "account"
        ? {
            ...row,
            assetClassId: "cash",
            trackingMethod: "INDIVIDUAL_UNITS" as const,
          }
        : row,
    );
    const context = buildAccountFilterContext(
      changed,
      summarize(changed),
      classes,
    );
    expect(context.assetClass.options.values).toEqual([key("cash")]);
    expect(context.trackingMethod.options.values).toEqual(["INDIVIDUAL_UNITS"]);
    expect(context.assetClass.valuesByAccountId.get("archived")).toEqual([
      key("cash"),
    ]);
  });
});
