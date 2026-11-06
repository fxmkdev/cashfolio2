import type { TreeNodeData } from "@mantine/core";
import { describe, expect, it } from "vitest";
import { AccountType } from "@/.prisma-client/enums";
import {
  buildLedgerAccountSwitcherData,
  filterLedgerAccountNode,
  type NavigationGroup,
} from "./account-switcher-data";

function group(
  id: string,
  overrides: Partial<NavigationGroup> = {},
): NavigationGroup {
  return {
    id,
    name: id,
    parentGroupId: null,
    isActive: true,
    sortOrder: null,
    ...overrides,
  };
}

function account(
  id: string,
  overrides: Partial<
    Parameters<typeof buildLedgerAccountSwitcherData>[0]["accounts"][number]
  > = {},
) {
  return {
    id,
    name: id,
    groupId: null,
    type: AccountType.BALANCE,
    isActive: true,
    sortOrder: null,
    ...overrides,
  };
}

function flatten(nodes: TreeNodeData[]): TreeNodeData[] {
  return nodes.flatMap((node) => [node, ...flatten(node.children ?? [])]);
}

describe("ledger account switcher data", () => {
  it("uses IDs to distinguish duplicate group names and treats slashes literally", () => {
    const tree = buildLedgerAccountSwitcherData({
      groups: [
        group("left", { name: "Bank / Cash" }),
        group("right", { name: "Bank / Cash" }),
      ],
      accounts: [
        account("a", { name: "Checking", groupId: "left" }),
        account("b", { name: "Checking", groupId: "right" }),
      ],
    });
    expect(tree.data.map((node) => node.value)).toEqual([
      "group:left",
      "group:right",
    ]);
    expect(
      tree.data.map((node) => node.children?.map((child) => child.value)),
    ).toEqual([["a"], ["b"]]);
    expect(tree.ancestorsByAccountId.get("a")).toEqual(["group:left"]);
    expect(flatten(tree.data)).toHaveLength(4);
    expect(
      filterLedgerAccountNode(
        "  BANK / CASH / checking  ",
        tree.data[0]!.children![0]!,
      ),
    ).toBe(true);
    expect(
      filterLedgerAccountNode("savings", tree.data[0]!.children![0]!),
    ).toBe(false);
  });

  it("preserves mixed account/group sibling ordering with name and null-order fallbacks", () => {
    const tree = buildLedgerAccountSwitcherData({
      groups: [
        group("group", { name: "First Group", sortOrder: 0 }),
        group("empty", { name: "Z Empty" }),
      ],
      accounts: [
        account("z", { name: "Zebra", sortOrder: 1 }),
        account("a", { name: "Alpha", sortOrder: 1 }),
        account("null", { name: "Unordered" }),
      ],
    });
    expect(tree.data.map((node) => node.value)).toEqual([
      "group:group",
      "a",
      "z",
      "null",
      "group:empty",
    ]);
    expect(tree.data[0]!.nodeProps?.disabled).toBe(true);
    expect(tree.accountIds).toEqual(new Set(["z", "a", "null"]));
  });

  it("projects archived branches last and expands the complete current path", () => {
    const tree = buildLedgerAccountSwitcherData({
      groups: [
        group("bank"),
        group("old", { parentGroupId: "bank", isActive: false }),
        group("nested", { parentGroupId: "old", isActive: false }),
      ],
      accounts: [
        account("active", { groupId: "bank" }),
        account("archived", { groupId: "bank", isActive: false }),
        account("nested-archived", { groupId: "nested", isActive: false }),
        account("root-archived", { isActive: false }),
      ],
    });
    const bank = tree.data.find((node) => node.value === "group:bank")!;
    const archive = bank.children!.at(-1)!;
    expect(archive.label).toBe("Archived");
    expect(archive.children!.map((node) => node.value)).toEqual([
      "archived",
      "group:old",
    ]);
    expect(tree.data.at(-1)!.label).toBe("Archived");
    expect(tree.ancestorsByAccountId.get("nested-archived")).toEqual([
      "group:bank",
      archive.value,
      "group:old",
      "group:nested",
    ]);
    expect(tree.ancestorsByAccountId.get("active")).toEqual(["group:bank"]);
    expect(tree.ancestorsByAccountId.get("root-archived")).toEqual([
      tree.data.at(-1)!.value,
    ]);
  });

  it("excludes category/system accounts and supports empty and ungrouped account trees", () => {
    const tree = buildLedgerAccountSwitcherData({
      groups: [],
      accounts: [
        account("financial"),
        account("category", { type: AccountType.EQUITY }),
        account("system", { type: AccountType.EQUITY }),
      ],
    });
    expect(tree.data.map((node) => node.value)).toEqual(["financial"]);
    expect(tree.ancestorsByAccountId.get("financial")).toEqual([]);
    expect(tree.accountIds).toEqual(new Set(["financial"]));
    expect(
      buildLedgerAccountSwitcherData({ groups: [], accounts: [] }).data,
    ).toEqual([]);
  });
});
