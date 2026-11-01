import { describe, expect, test } from "vitest";
import type { ClassificationNode } from "../../shared/asset-class";
import {
  buildAssetClassTreeData,
  filterAssetClassTreeNode,
} from "./asset-class-tree-data";

const nodes: ClassificationNode[] = [
  { id: "second-child", name: "Swiss", parentId: "equities", sortOrder: 2 },
  { id: "cash", name: "Cash", parentId: null, sortOrder: 1 },
  { id: "equities", name: "Equities", parentId: null, sortOrder: 0 },
  { id: "first-child", name: "Global", parentId: "equities", sortOrder: 0 },
  {
    id: "grandchild",
    name: "Small Cap",
    parentId: "first-child",
    sortOrder: 0,
  },
];

describe("asset class tree data", () => {
  test("nests by stable IDs and preserves configured sibling order", () => {
    const tree = buildAssetClassTreeData(nodes);
    expect(tree.map((node) => node.value)).toEqual(["equities", "cash"]);
    expect(tree[0]).toMatchObject({ value: "equities", label: "Equities" });
    expect(tree[0].children?.map((node) => node.value)).toEqual([
      "first-child",
      "second-child",
    ]);
    expect(tree[0].children?.[0].children).toEqual([
      {
        value: "grandchild",
        label: "Small Cap",
        nodeProps: { searchLabel: "Equities / Global / Small Cap" },
      },
    ]);
  });

  test("searches full paths ignoring case and surrounding whitespace", () => {
    const leaf = buildAssetClassTreeData(nodes)[0].children![0].children![0];
    expect(filterAssetClassTreeNode("  EQUITIES / global  ", leaf)).toBe(true);
    expect(filterAssetClassTreeNode("small cap", leaf)).toBe(true);
    expect(filterAssetClassTreeNode("cash", leaf)).toBe(false);
  });

  test("keeps duplicate names in their respective branches", () => {
    const tree = buildAssetClassTreeData([
      ...nodes,
      { id: "cash-swiss", name: "Swiss", parentId: "cash", sortOrder: 0 },
    ]);
    const swissEquities = tree[0].children![1];
    const swissCash = tree[1].children![0];
    expect(swissEquities.label).toBe(swissCash.label);
    expect(swissEquities.value).not.toBe(swissCash.value);
    expect(filterAssetClassTreeNode("cash / swiss", swissCash)).toBe(true);
    expect(filterAssetClassTreeNode("cash / swiss", swissEquities)).toBe(false);
  });

  test("treats slashes in names as literal text rather than hierarchy", () => {
    const tree = buildAssetClassTreeData([
      { id: "root", name: "Stocks / Bonds", parentId: null, sortOrder: 0 },
      { id: "child", name: "US / Europe", parentId: "root", sortOrder: 0 },
    ]);
    expect(tree).toEqual([
      {
        value: "root",
        label: "Stocks / Bonds",
        nodeProps: { searchLabel: "Stocks / Bonds" },
        children: [
          {
            value: "child",
            label: "US / Europe",
            nodeProps: { searchLabel: "Stocks / Bonds / US / Europe" },
          },
        ],
      },
    ]);
  });

  test("supports empty trees and searches labels of synthetic choices", () => {
    expect(buildAssetClassTreeData([])).toEqual([]);
    expect(
      filterAssetClassTreeNode("UNCLASSIFIED", {
        value: "",
        label: "Unclassified",
      }),
    ).toBe(true);
  });
});
