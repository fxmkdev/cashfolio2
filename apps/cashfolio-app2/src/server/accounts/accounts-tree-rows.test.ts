import { describe, expect, test } from "vitest";
import { AccountType, Unit } from "../../.prisma-client/enums";
import {
  buildAccountRows,
  buildGroupRows,
  filterGroupsForAccountState,
  sortAccountTreeRows,
  type AccountTreeAccount,
  type AccountTreeGroup,
} from "./accounts-tree-rows";

function createGroupHierarchyMap(groups: AccountTreeGroup[]) {
  return new Map(
    groups.map((group) => [
      group.id,
      {
        id: group.id,
        parentGroupId: group.parentGroupId,
        isActive: group.isActive,
      },
    ]),
  );
}

describe("filterGroupsForAccountState", () => {
  test("keeps inactive groups and their ancestors for inactive mode", () => {
    const groups: AccountTreeGroup[] = [
      {
        id: "root",
        name: "Root",
        type: AccountType.ASSET,
        equityAccountSubtype: null,
        parentGroupId: null,
        isActive: true,
        sortOrder: 0,
      },
      {
        id: "archived-child",
        name: "Archived Child",
        type: AccountType.ASSET,
        equityAccountSubtype: null,
        parentGroupId: "root",
        isActive: false,
        sortOrder: 1,
      },
    ];
    const accounts: AccountTreeAccount[] = [
      {
        id: "account-1",
        name: "Account",
        type: AccountType.ASSET,
        equityAccountSubtype: null,
        unit: Unit.CURRENCY,
        currency: "CHF",
        cryptocurrency: null,
        symbol: null,
        tradeCurrency: null,
        groupId: "archived-child",
        isActive: false,
        sortOrder: 0,
      },
    ];

    const filteredGroups = filterGroupsForAccountState({
      accountState: "inactive",
      accountGroups: groups,
      accounts,
    });

    expect(filteredGroups.map((group) => group.id)).toEqual([
      "root",
      "archived-child",
    ]);
  });
});

describe("buildAccountRows and buildGroupRows", () => {
  test("applies display-balance sign rules and action availability", () => {
    const groups: AccountTreeGroup[] = [
      {
        id: "root",
        name: "Root",
        type: AccountType.ASSET,
        equityAccountSubtype: null,
        parentGroupId: null,
        isActive: true,
        sortOrder: 0,
      },
    ];
    const accounts: AccountTreeAccount[] = [
      {
        id: "asset-1",
        name: "Asset",
        type: AccountType.ASSET,
        equityAccountSubtype: null,
        unit: Unit.CURRENCY,
        currency: "CHF",
        cryptocurrency: null,
        symbol: null,
        tradeCurrency: null,
        groupId: "root",
        isActive: true,
        sortOrder: 1,
      },
      {
        id: "liability-1",
        name: "Liability",
        type: AccountType.LIABILITY,
        equityAccountSubtype: null,
        unit: Unit.CURRENCY,
        currency: "CHF",
        cryptocurrency: null,
        symbol: null,
        tradeCurrency: null,
        groupId: "root",
        isActive: true,
        sortOrder: 2,
      },
    ];

    const accountRows = buildAccountRows({
      accounts,
      rawBalanceByAccountId: new Map([
        ["asset-1", 100],
        ["liability-1", 25],
      ]),
      allScheduledRawBalanceByAccountId: new Map([
        ["asset-1", 100],
        ["liability-1", 25],
      ]),
      openingRawBalanceByAccountId: new Map([
        ["asset-1", 80],
        ["liability-1", -10],
      ]),
      displayBalanceInReferenceCurrencyByAccountId: new Map([
        ["asset-1", 100],
        ["liability-1", -25],
      ]),
      bookingCountByAccountId: new Map(),
      groupById: createGroupHierarchyMap(groups),
      includeActionAvailability: false,
    });

    expect(accountRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "asset-1",
          balance: 100,
          balanceInReferenceCurrency: 100,
          openingBalance: 80,
          deletable: false,
          archivable: false,
          unarchivable: false,
        }),
        expect.objectContaining({
          id: "liability-1",
          balance: -25,
          balanceInReferenceCurrency: -25,
          openingBalance: 10,
          deletable: false,
          archivable: false,
          unarchivable: false,
        }),
      ]),
    );

    const groupRows = buildGroupRows({
      groups,
      groupById: createGroupHierarchyMap(groups),
      includeActionAvailability: false,
      groupsWithChildAccounts: new Set(["root"]),
      groupsWithChildGroups: new Set<string>(),
      groupsWithActiveChildAccounts: new Set(["root"]),
      groupsWithActiveChildGroups: new Set<string>(),
    });

    expect(groupRows).toHaveLength(1);
    expect(groupRows[0]).toMatchObject({
      id: "root",
      nodeType: "accountGroup",
      deletable: false,
      archivable: false,
      unarchivable: false,
    });
  });
});

describe("sortAccountTreeRows", () => {
  test("sorts by parent, then sort order, then name", () => {
    const sortedRows = sortAccountTreeRows([
      {
        id: "c",
        nodeType: "account",
        name: "C",
        type: AccountType.ASSET,
        equityAccountSubtype: null,
        unit: Unit.CURRENCY,
        currency: "CHF",
        cryptocurrency: null,
        symbol: null,
        tradeCurrency: null,
        balance: 0,
        balanceInReferenceCurrency: 0,
        openingBalance: 0,
        parentId: "b",
        isActive: true,
        groupId: "b",
        sortOrder: null,
        deletable: false,
        deleteDisabledReason: "x",
        archivable: false,
        archiveDisabledReason: "x",
        unarchivable: false,
        unarchiveDisabledReason: "x",
      },
      {
        id: "a",
        nodeType: "account",
        name: "A",
        type: AccountType.ASSET,
        equityAccountSubtype: null,
        unit: Unit.CURRENCY,
        currency: "CHF",
        cryptocurrency: null,
        symbol: null,
        tradeCurrency: null,
        balance: 0,
        balanceInReferenceCurrency: 0,
        openingBalance: 0,
        parentId: "",
        isActive: true,
        groupId: undefined,
        sortOrder: 2,
        deletable: false,
        deleteDisabledReason: "x",
        archivable: false,
        archiveDisabledReason: "x",
        unarchivable: false,
        unarchiveDisabledReason: "x",
      },
      {
        id: "b",
        nodeType: "account",
        name: "B",
        type: AccountType.ASSET,
        equityAccountSubtype: null,
        unit: Unit.CURRENCY,
        currency: "CHF",
        cryptocurrency: null,
        symbol: null,
        tradeCurrency: null,
        balance: 0,
        balanceInReferenceCurrency: 0,
        openingBalance: 0,
        parentId: "",
        isActive: true,
        groupId: undefined,
        sortOrder: 1,
        deletable: false,
        deleteDisabledReason: "x",
        archivable: false,
        archiveDisabledReason: "x",
        unarchivable: false,
        unarchiveDisabledReason: "x",
      },
    ]);

    expect(sortedRows.map((row) => row.id)).toEqual(["b", "a", "c"]);
  });
});
