import { describe, expect, test } from "vitest";
import {
  ACCOUNT_TREE_GROUP_VALUE_PREFIX,
  buildAccountTreeData,
  getAccountTreeSearchLabel,
  isAccountTreeSelectableValue,
} from "./account-tree-select";

describe("buildAccountTreeData", () => {
  test("groups accounts under type and group path", () => {
    const treeData = buildAccountTreeData([
      {
        value: "account-checking",
        label: "Asset / Cash / Checking",
        treePath: ["Asset", "Cash"],
        treeLabel: "Checking",
      },
      {
        value: "account-savings",
        label: "Asset / Savings",
        treePath: ["Asset"],
        treeLabel: "Savings",
      },
    ]);

    expect(treeData).toEqual([
      {
        value: `${ACCOUNT_TREE_GROUP_VALUE_PREFIX}Asset`,
        label: "Asset",
        nodeProps: { searchLabel: "Asset" },
        children: [
          {
            value: `${ACCOUNT_TREE_GROUP_VALUE_PREFIX}Asset/Cash`,
            label: "Cash",
            nodeProps: { searchLabel: "Asset / Cash" },
            children: [
              {
                value: "account-checking",
                label: "Checking",
                nodeProps: { searchLabel: "Asset / Cash / Checking" },
              },
            ],
          },
          {
            value: "account-savings",
            label: "Savings",
            nodeProps: { searchLabel: "Asset / Savings" },
          },
        ],
      },
    ]);
  });

  test("uses account ids only for selectable account leaves", () => {
    const options = [
      {
        value: "account-checking",
        label: "Asset / Cash / Checking",
        treePath: ["Asset", "Cash"],
        treeLabel: "Checking",
      },
    ];
    const treeData = buildAccountTreeData(options);

    expect(isAccountTreeSelectableValue("account-checking", options)).toBe(
      true,
    );
    expect(
      isAccountTreeSelectableValue(treeData[0]?.value ?? null, options),
    ).toBe(false);
  });

  test("uses stable synthetic group values that cannot collide with account ids", () => {
    const treeData = buildAccountTreeData([
      {
        value: "account-checking",
        label: "Asset / Cash & Bank / Checking",
        treePath: ["Asset", "Cash & Bank"],
        treeLabel: "Checking",
      },
    ]);

    expect(treeData[0]?.value).toBe(`${ACCOUNT_TREE_GROUP_VALUE_PREFIX}Asset`);
    expect(treeData[0]?.children?.[0]?.value).toBe(
      `${ACCOUNT_TREE_GROUP_VALUE_PREFIX}Asset/Cash%20%26%20Bank`,
    );
    expect(treeData[0]?.children?.[0]?.value).not.toBe("account-checking");
  });

  test("keeps options without hierarchy as root account leaves", () => {
    const treeData = buildAccountTreeData([
      { value: "account-savings", label: "Savings (CHF)" },
      { value: "account-cash", label: "Cash (CHF)" },
    ]);

    expect(treeData).toEqual([
      {
        value: "account-savings",
        label: "Savings (CHF)",
        nodeProps: { searchLabel: "Savings (CHF)" },
      },
      {
        value: "account-cash",
        label: "Cash (CHF)",
        nodeProps: { searchLabel: "Cash (CHF)" },
      },
    ]);
  });

  test("returns the full search label from node props", () => {
    const treeData = buildAccountTreeData([
      {
        value: "account-checking",
        label: "Asset / Cash / Checking",
        treePath: ["Asset", "Cash"],
        treeLabel: "Checking",
      },
    ]);

    expect(
      getAccountTreeSearchLabel(treeData[0]?.children?.[0]?.children?.[0]!),
    ).toBe("Asset / Cash / Checking");
  });
});
