import { describe, expect, test } from "vitest";
import { toMoney } from "../shared/money";
import { toNumericMoney } from "./money-boundary";
import {
  AccountType,
  buildPeriodEndAllocationBreakdown,
} from "./period.test-support";

describe("buildPeriodEndAllocationBreakdown", () => {
  const groupById = new Map([
    [
      "assets",
      {
        id: "assets",
        name: "Assets",
        parentGroupId: null,
      },
    ],
    [
      "liabilities",
      {
        id: "liabilities",
        name: "Liabilities",
        parentGroupId: null,
      },
    ],
  ]);

  test("shows amounts owed as positive allocation magnitudes", () => {
    const result = buildPeriodEndAllocationBreakdown({
      side: "liability",
      items: [
        {
          accountId: "liability-card",
          accountName: "Credit Card",
          groupId: "liabilities",
          accountType: AccountType.BALANCE,
          convertedBalanceInReferenceCurrency: toMoney(-1200.5),
        },
      ],
      groupById,
    });

    expect(toNumericMoney(result.totalAmount)).toBe(1200.5);
    expect(toNumericMoney(result.items)).toEqual([
      {
        id: "group:liabilities",
        label: "Liabilities",
        kind: "group",
        amount: 1200.5,
        percentage: 100,
      },
    ]);
    expect(result.skippedMissingReferenceBalanceCount).toBe(0);
  });

  test("includes credit balances from liability accounts and tracks missing conversion", () => {
    const result = buildPeriodEndAllocationBreakdown({
      side: "asset",
      items: [
        {
          accountId: "asset-missing",
          accountName: "Missing",
          groupId: "assets",
          accountType: AccountType.BALANCE,
          convertedBalanceInReferenceCurrency: null,
        },
        {
          accountId: "asset-zero",
          accountName: "Zero",
          groupId: "assets",
          accountType: AccountType.BALANCE,
          convertedBalanceInReferenceCurrency: toMoney(0),
        },
        {
          accountId: "liability-not-outstanding",
          accountName: "Not Outstanding",
          groupId: "liabilities",
          accountType: AccountType.BALANCE,
          convertedBalanceInReferenceCurrency: toMoney(25),
        },
        {
          accountId: "asset-visible",
          accountName: "Visible",
          groupId: "assets",
          accountType: AccountType.BALANCE,
          convertedBalanceInReferenceCurrency: toMoney(100),
        },
      ],
      groupById,
    });

    expect(toNumericMoney(result.totalAmount)).toBe(125);
    expect(toNumericMoney(result.items)).toEqual([
      {
        id: "group:assets",
        label: "Assets",
        kind: "group",
        amount: 100,
        percentage: 80,
      },
      {
        id: "group:liabilities",
        label: "Liabilities",
        kind: "group",
        amount: 25,
        percentage: 20,
      },
    ]);
    expect(result.skippedMissingReferenceBalanceCount).toBe(1);
  });

  test("propagates discrepancy metadata for hidden rounded children", () => {
    const result = buildPeriodEndAllocationBreakdown({
      side: "asset",
      items: [
        {
          accountId: "asset-main",
          accountName: "Main",
          groupId: "assets",
          accountType: AccountType.BALANCE,
          convertedBalanceInReferenceCurrency: toMoney(100.002),
        },
        {
          accountId: "asset-tiny",
          accountName: "Tiny",
          groupId: "assets",
          accountType: AccountType.BALANCE,
          convertedBalanceInReferenceCurrency: toMoney(0.004),
        },
      ],
      groupById,
    });

    expect(toNumericMoney(result.hasHiddenAmountDiscrepancy)).toBe(true);
    expect(toNumericMoney(result.hiddenAmountDiscrepancyNodeIds)).toEqual([
      "group:assets",
    ]);
    expect(toNumericMoney(result.hierarchy)).toEqual([
      {
        id: "group:assets",
        label: "Assets",
        kind: "group",
        amount: 100.01,
        children: [
          {
            id: "account:asset-main",
            label: "Main",
            kind: "account",
            amount: 100,
            children: [],
          },
        ],
      },
    ]);
  });
});
