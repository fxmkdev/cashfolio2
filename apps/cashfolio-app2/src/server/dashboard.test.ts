import { describe, expect, it } from "vitest";
import { buildAssetAllocationFromTreeRows } from "./dashboard-asset-allocation";

describe("buildAssetAllocationFromTreeRows", () => {
  it("rolls nested asset accounts up to their top-level group", () => {
    const allocation = buildAssetAllocationFromTreeRows({
      referenceCurrency: "CHF",
      rows: [
        {
          id: "group-assets",
          name: "Assets",
          nodeType: "accountGroup",
          parentId: undefined,
          groupId: "group-assets",
          balanceInReferenceCurrency: null,
        },
        {
          id: "group-cash",
          name: "Cash",
          nodeType: "accountGroup",
          parentId: "group-assets",
          groupId: "group-cash",
          balanceInReferenceCurrency: null,
        },
        {
          id: "account-checking",
          name: "Checking",
          nodeType: "account",
          parentId: "group-cash",
          groupId: "group-cash",
          balanceInReferenceCurrency: 100,
        },
        {
          id: "account-broker",
          name: "Broker",
          nodeType: "account",
          parentId: "group-assets",
          groupId: "group-assets",
          balanceInReferenceCurrency: 50,
        },
      ],
    });

    expect(allocation.items).toEqual([
      {
        id: "group:group-assets",
        label: "Assets",
        amount: 150,
        percentage: 100,
        kind: "group",
      },
    ]);
    expect(allocation.totalIncludedAmount).toBe(150);
  });

  it("keeps ungrouped accounts as individual slices", () => {
    const allocation = buildAssetAllocationFromTreeRows({
      referenceCurrency: "CHF",
      rows: [
        {
          id: "account-wallet",
          name: "Wallet",
          nodeType: "account",
          parentId: undefined,
          groupId: undefined,
          balanceInReferenceCurrency: 80,
        },
        {
          id: "account-exchange",
          name: "Exchange",
          nodeType: "account",
          parentId: undefined,
          groupId: undefined,
          balanceInReferenceCurrency: 20,
        },
      ],
    });

    expect(allocation.items).toEqual([
      {
        id: "account:account-wallet",
        label: "Wallet",
        amount: 80,
        percentage: 80,
        kind: "ungroupedAccount",
      },
      {
        id: "account:account-exchange",
        label: "Exchange",
        amount: 20,
        percentage: 20,
        kind: "ungroupedAccount",
      },
    ]);
    expect(allocation.totalIncludedAmount).toBe(100);
  });

  it("skips accounts with missing reference balances", () => {
    const allocation = buildAssetAllocationFromTreeRows({
      referenceCurrency: "CHF",
      rows: [
        {
          id: "account-missing",
          name: "Missing FX",
          nodeType: "account",
          parentId: undefined,
          groupId: undefined,
          balanceInReferenceCurrency: null,
        },
        {
          id: "account-valid",
          name: "Cash",
          nodeType: "account",
          parentId: undefined,
          groupId: undefined,
          balanceInReferenceCurrency: 10,
        },
      ],
    });

    expect(allocation.items).toHaveLength(1);
    expect(allocation.skippedMissingReferenceBalanceCount).toBe(1);
    expect(allocation.skippedNonPositiveCount).toBe(0);
  });

  it("excludes non-positive accounts from slices", () => {
    const allocation = buildAssetAllocationFromTreeRows({
      referenceCurrency: "CHF",
      rows: [
        {
          id: "account-zero",
          name: "Zero",
          nodeType: "account",
          parentId: undefined,
          groupId: undefined,
          balanceInReferenceCurrency: 0,
        },
        {
          id: "account-negative",
          name: "Negative",
          nodeType: "account",
          parentId: undefined,
          groupId: undefined,
          balanceInReferenceCurrency: -10,
        },
        {
          id: "account-positive",
          name: "Positive",
          nodeType: "account",
          parentId: undefined,
          groupId: undefined,
          balanceInReferenceCurrency: 25,
        },
      ],
    });

    expect(allocation.items).toEqual([
      {
        id: "account:account-positive",
        label: "Positive",
        amount: 25,
        percentage: 100,
        kind: "ungroupedAccount",
      },
    ]);
    expect(allocation.skippedNonPositiveCount).toBe(2);
  });

  it("computes percentages from included positive totals", () => {
    const allocation = buildAssetAllocationFromTreeRows({
      referenceCurrency: "CHF",
      rows: [
        {
          id: "account-a",
          name: "A",
          nodeType: "account",
          parentId: undefined,
          groupId: undefined,
          balanceInReferenceCurrency: 150,
        },
        {
          id: "account-b",
          name: "B",
          nodeType: "account",
          parentId: undefined,
          groupId: undefined,
          balanceInReferenceCurrency: 75,
        },
      ],
    });

    expect(allocation.totalIncludedAmount).toBe(225);
    expect(allocation.items[0]?.percentage).toBe(66.67);
    expect(allocation.items[1]?.percentage).toBe(33.33);
  });
});
