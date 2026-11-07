import { describe, expect, it } from "vitest";
import {
  buildAccountReturnGroups,
  assetClassRowId,
  unitRowId,
  archivedClassRowId,
} from "./account-return-groups";
import { account } from "../server/accounts/returns/return-test-support";

const classes = [
  { id: "assets", name: "Assets", parentId: null, sortOrder: 0 },
  { id: "equities", name: "Equities", parentId: "assets", sortOrder: 0 },
];
const groups = [
  { id: "group", name: "Group", parentGroupId: null, isActive: true },
  { id: "old", name: "Old", parentGroupId: "group", isActive: false },
];
const accounts = [
  account(),
  account("b", { isActive: false }),
  account("c", { groupId: "old", isActive: false }),
  account("cash", { assetClassId: null, groupId: null, currency: "CHF" }),
];
describe("return scope memberships", () => {
  it("includes archived descendants once and retains archived-group structure", () => {
    const result = buildAccountReturnGroups({
      accounts,
      groups,
      classes,
      grouping: "accountStructure",
    });
    expect([...result.get("group")!.accountIds].sort()).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(
      [...result.get("__archived__:group:group")!.accountIds].sort(),
    ).toEqual(["b", "c"]);
    expect([...result.get("old")!.accountIds]).toEqual(["c"]);
  });
  it("uses the displayed IDs for classes, unit groups, and Archived branches", () => {
    const result = buildAccountReturnGroups({
      accounts,
      groups,
      classes,
      grouping: "assetClass",
    });
    expect(
      [...result.get(assetClassRowId("assets"))!.accountIds].sort(),
    ).toEqual(["a", "b", "c"]);
    const id = unitRowId(assetClassRowId("equities"), "CURRENCY:USD");
    expect([...result.get(id)!.accountIds].sort()).toEqual(["a", "b", "c"]);
    expect([...result.get(archivedClassRowId(id))!.accountIds].sort()).toEqual([
      "b",
      "c",
    ]);
    expect([...result.get("__asset_class_unclassified__")!.accountIds]).toEqual(
      ["cash"],
    );
  });
});
