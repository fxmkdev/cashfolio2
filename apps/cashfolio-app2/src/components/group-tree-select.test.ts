import { describe, expect, test } from "vitest";
import {
  buildGroupTreeData,
  getGroupTreeSearchLabel,
} from "./group-tree-select";

describe("buildGroupTreeData", () => {
  test("nests groups by parent group id", () => {
    const treeData = buildGroupTreeData([
      {
        value: "group-assets",
        label: "Assets",
        parentGroupId: null,
      },
      {
        value: "group-cash",
        label: "Assets / Cash",
        parentGroupId: "group-assets",
      },
      {
        value: "group-bank",
        label: "Assets / Cash / Bank",
        parentGroupId: "group-cash",
      },
    ]);

    expect(treeData).toEqual([
      {
        value: "group-assets",
        label: "Assets",
        nodeProps: { searchLabel: "Assets" },
        children: [
          {
            value: "group-cash",
            label: "Cash",
            nodeProps: { searchLabel: "Assets / Cash" },
            children: [
              {
                value: "group-bank",
                label: "Bank",
                nodeProps: { searchLabel: "Assets / Cash / Bank" },
              },
            ],
          },
        ],
      },
    ]);
  });

  test("falls back to path labels when parent ids are absent", () => {
    const treeData = buildGroupTreeData([
      {
        value: "group-assets",
        label: "Assets",
      },
      {
        value: "group-cash",
        label: "Assets / Cash",
      },
    ]);

    expect(treeData).toEqual([
      {
        value: "group-assets",
        label: "Assets",
        nodeProps: { searchLabel: "Assets" },
        children: [
          {
            value: "group-cash",
            label: "Cash",
            nodeProps: { searchLabel: "Assets / Cash" },
          },
        ],
      },
    ]);
  });

  test("uses actual group ids for selectable parent nodes", () => {
    const treeData = buildGroupTreeData([
      {
        value: "group-assets",
        label: "Assets",
      },
      {
        value: "group-cash",
        label: "Assets / Cash",
      },
    ]);

    expect(treeData[0]?.value).toBe("group-assets");
    expect(treeData[0]?.children?.[0]?.value).toBe("group-cash");
  });

  test("uses explicit tree labels when group names contain path delimiters", () => {
    const treeData = buildGroupTreeData([
      {
        value: "group-assets",
        label: "Assets",
        parentGroupId: null,
        treePath: [],
        treeLabel: "Assets",
      },
      {
        value: "group-cash-bank",
        label: "Assets / Cash / Bank",
        parentGroupId: "group-assets",
        treePath: ["Assets"],
        treeLabel: "Cash / Bank",
      },
    ]);

    expect(treeData).toEqual([
      {
        value: "group-assets",
        label: "Assets",
        nodeProps: { searchLabel: "Assets" },
        children: [
          {
            value: "group-cash-bank",
            label: "Cash / Bank",
            nodeProps: { searchLabel: "Assets / Cash / Bank" },
          },
        ],
      },
    ]);
  });

  test("returns the full search label from node props", () => {
    const treeData = buildGroupTreeData([
      {
        value: "group-bank",
        label: "Assets / Cash / Bank",
        treePath: ["Assets", "Cash"],
        treeLabel: "Bank",
      },
    ]);

    expect(getGroupTreeSearchLabel(treeData[0]!)).toBe("Assets / Cash / Bank");
  });
});
