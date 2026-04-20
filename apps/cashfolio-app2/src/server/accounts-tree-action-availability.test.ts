import { describe, expect, it } from "vitest";
import { buildAccountTreeGroupActionAvailabilitySets } from "./accounts-tree-action-availability";

describe("buildAccountTreeGroupActionAvailabilitySets", () => {
  it("builds distinct positive-count sets and ignores null ids", () => {
    const result = buildAccountTreeGroupActionAvailabilitySets({
      accountBook: {
        securityHoldingGainLossAccountGroupId: "group-security",
        cryptoHoldingGainLossAccountGroupId: null,
        fxHoldingGainLossAccountGroupId: "group-fx",
      },
      allAccountsForGroup: [
        { groupId: "group-1", _count: 2 },
        { groupId: "group-zero", _count: 0 },
        { groupId: null, _count: 4 },
      ],
      allGroupsForParent: [
        { parentGroupId: "group-parent", _count: 1 },
        { parentGroupId: null, _count: 5 },
      ],
      activeAccountsForGroup: [
        { groupId: "group-1", _count: 1 },
        { groupId: "group-inactive", _count: 0 },
      ],
      activeGroupsForParent: [
        { parentGroupId: "group-parent", _count: 1 },
        { parentGroupId: "group-zero", _count: 0 },
      ],
    });

    expect(Array.from(result.referencedByAccountBook).sort()).toEqual([
      "group-fx",
      "group-security",
    ]);
    expect(Array.from(result.groupsWithChildAccounts).sort()).toEqual([
      "group-1",
    ]);
    expect(Array.from(result.groupsWithChildGroups).sort()).toEqual([
      "group-parent",
    ]);
    expect(Array.from(result.groupsWithActiveChildAccounts).sort()).toEqual([
      "group-1",
    ]);
    expect(Array.from(result.groupsWithActiveChildGroups).sort()).toEqual([
      "group-parent",
    ]);
  });
});
