import { describe, expect, test } from "vitest";
import { AccountType, Unit } from "../../.prisma-client/enums";
import {
  applyAccountGroupParentCashInheritance,
  canMarkAccountGroupSubtreeAsCash,
  getAccountGroupCashParentCompatibilityError,
  getCashAccountGroupDisabledReason,
  isRootCashAccountGroupEditable,
  resolveAccountGroupCashAccountFormValue,
  type ExistingNode,
} from "./account-cash-form-rules";

const accountGroups = [
  {
    value: "cash-parent",
    label: "Cash",
    type: AccountType.BALANCE,
    equityAccountSubtype: null,
    isCashAccount: true,
  },
  {
    value: "asset-parent",
    label: "Assets",
    type: AccountType.BALANCE,
    equityAccountSubtype: null,
    isCashAccount: false,
  },
];

describe("account group cash helpers", () => {
  test("allows editing only for root balance groups", () => {
    expect(
      isRootCashAccountGroupEditable({
        type: AccountType.BALANCE,
        parentGroupId: undefined,
      }),
    ).toBe(true);
    expect(
      isRootCashAccountGroupEditable({
        type: AccountType.BALANCE,
        parentGroupId: "parent",
      }),
    ).toBe(false);
    expect(
      isRootCashAccountGroupEditable({
        type: AccountType.BALANCE,
        parentGroupId: undefined,
      }),
    ).toBe(true);
  });

  test("inherits cash status from selected parent group", () => {
    expect(
      resolveAccountGroupCashAccountFormValue({
        type: AccountType.BALANCE,
        parentGroupId: "cash-parent",
        isCashAccount: false,
        accountGroups,
      }),
    ).toBe(true);
    expect(
      resolveAccountGroupCashAccountFormValue({
        type: AccountType.BALANCE,
        parentGroupId: "asset-parent",
        isCashAccount: true,
        accountGroups,
      }),
    ).toBe(false);
  });

  test("applies inherited cash status before submit", () => {
    expect(
      applyAccountGroupParentCashInheritance(
        {
          name: "Wallets",
          typeDescriptor: AccountType.BALANCE,
          type: AccountType.BALANCE,
          parentGroupId: "cash-parent",
          isCashAccount: false,
        },
        accountGroups,
      ),
    ).toMatchObject({ isCashAccount: true });
  });

  test("allows cash marking for root asset groups with cashable descendants", () => {
    const existingNodes: ExistingNode[] = [
      {
        id: "group-cash",
        name: "Cash",
        nodeType: "accountGroup",
        type: AccountType.BALANCE,
      },
      {
        id: "group-wallets",
        name: "Wallets",
        nodeType: "accountGroup",
        type: AccountType.BALANCE,
        parentId: "group-cash",
      },
      {
        id: "account-wallet",
        name: "Wallet",
        nodeType: "account",
        type: AccountType.BALANCE,
        unit: Unit.CURRENCY,
        groupId: "group-wallets",
      },
    ];

    expect(
      canMarkAccountGroupSubtreeAsCash({
        groupId: "group-cash",
        existingNodes,
      }),
    ).toBe(true);
    expect(
      getCashAccountGroupDisabledReason({
        type: AccountType.BALANCE,
        groupId: "group-cash",
        existingNodes,
      }),
    ).toBeUndefined();
  });

  test.each([
    ["security account", AccountType.BALANCE, Unit.SECURITY],
    ["crypto account", AccountType.BALANCE, Unit.CRYPTOCURRENCY],
    ["equity account", AccountType.EQUITY, Unit.CURRENCY],
  ])(
    "disables cash marking when descendants include a %s",
    (_label, type, unit) => {
      const existingNodes: ExistingNode[] = [
        {
          id: "group-assets",
          name: "Assets",
          nodeType: "accountGroup",
          type: AccountType.BALANCE,
        },
        {
          id: "account-child",
          name: "Child",
          nodeType: "account",
          type,
          unit,
          groupId: "group-assets",
        },
      ];

      expect(
        getCashAccountGroupDisabledReason({
          type: AccountType.BALANCE,
          groupId: "group-assets",
          existingNodes,
        }),
      ).toBe(
        "Groups included in cash flow can contain only currency accounts and account sub-groups.",
      );
    },
  );

  test("disables cash marking when descendants include a category group", () => {
    const existingNodes: ExistingNode[] = [
      {
        id: "group-assets",
        name: "Assets",
        nodeType: "accountGroup",
        type: AccountType.BALANCE,
      },
      {
        id: "group-liability",
        name: "Liabilities",
        nodeType: "accountGroup",
        type: AccountType.EQUITY,
        parentId: "group-assets",
      },
    ];

    expect(
      getCashAccountGroupDisabledReason({
        type: AccountType.BALANCE,
        groupId: "group-assets",
        existingNodes,
      }),
    ).toBe(
      "Groups included in cash flow can contain only currency accounts and account sub-groups.",
    );
  });

  test("explains inherited cash status for nested groups", () => {
    expect(
      getCashAccountGroupDisabledReason({
        type: AccountType.BALANCE,
        parentGroupId: "asset-parent",
        groupId: "group-child",
        existingNodes: [],
      }),
    ).toBe("Cash-flow inclusion is inherited from the parent group.");
  });

  test("returns a parent group error when moving a non-cashable subtree into a cash group", () => {
    const existingNodes: ExistingNode[] = [
      {
        id: "group-assets",
        name: "Assets",
        nodeType: "accountGroup",
        type: AccountType.BALANCE,
      },
      {
        id: "account-brokerage",
        name: "Brokerage",
        nodeType: "account",
        type: AccountType.BALANCE,
        unit: Unit.SECURITY,
        groupId: "group-assets",
      },
    ];

    expect(
      getAccountGroupCashParentCompatibilityError({
        type: AccountType.BALANCE,
        parentGroupId: "cash-parent",
        groupId: "group-assets",
        accountGroups,
        existingNodes,
      }),
    ).toBe(
      "Groups included in cash flow can contain only currency accounts and account sub-groups.",
    );
  });

  test("allows eligible subtrees to move into cash groups", () => {
    const existingNodes: ExistingNode[] = [
      {
        id: "group-assets",
        name: "Assets",
        nodeType: "accountGroup",
        type: AccountType.BALANCE,
      },
      {
        id: "account-wallet",
        name: "Wallet",
        nodeType: "account",
        type: AccountType.BALANCE,
        unit: Unit.CURRENCY,
        groupId: "group-assets",
      },
    ];

    expect(
      getAccountGroupCashParentCompatibilityError({
        type: AccountType.BALANCE,
        parentGroupId: "cash-parent",
        groupId: "group-assets",
        accountGroups,
        existingNodes,
      }),
    ).toBeNull();
  });
});
