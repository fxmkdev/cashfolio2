import { describe, expect, it } from "vitest";
import type { PeriodBaseAssetLiabilityAccount } from "../base-data/period-base-data-types";
import { toMoney } from "../../../shared/money";
import { toNumericMoney } from "../../money-boundary";
import { buildGainLossAccountAttribution } from "./period-gain-loss-attribution";
import { buildPeriodEndAllocationBreakdown } from "./period-allocation-breakdown";
import { buildGainsLossesBreakdown } from "./period-gains-losses-breakdown";

const groups = [
  { id: "bank", name: "Bank", parentGroupId: null },
  { id: "brokerage", name: "Brokerage", parentGroupId: "bank" },
];
const groupById = new Map(groups.map((group) => [group.id, group]));
const assetClasses = [
  { id: "investments", name: "Investments", parentId: null, sortOrder: 0 },
  { id: "equities", name: "Equities", parentId: "investments", sortOrder: 0 },
];
function account(
  id: string,
  overrides: Partial<PeriodBaseAssetLiabilityAccount> = {},
): PeriodBaseAssetLiabilityAccount {
  return {
    id,
    name: "Holding",
    groupId: "brokerage",
    type: "BALANCE",
    assetClassId: "investments",
    trackingMethod: "INDIVIDUAL_UNITS",
    unit: "CURRENCY",
    currency: " chf ",
    cryptocurrency: null,
    symbol: null,
    tradeCurrency: null,
    isCashAccount: false,
    ...overrides,
  };
}
const accounts = [
  account("cash"),
  account("managed-chf", { trackingMethod: "TOTAL_PORTFOLIO_VALUE" }),
  account("managed-usd", {
    trackingMethod: "TOTAL_PORTFOLIO_VALUE",
    currency: "USD",
  }),
  account("aapl-usd", {
    unit: "SECURITY",
    currency: null,
    symbol: " aapl ",
    tradeCurrency: "USD",
    assetClassId: "equities",
  }),
  account("aapl-eur", {
    unit: "SECURITY",
    currency: null,
    symbol: "AAPL",
    tradeCurrency: "EUR",
    assetClassId: "equities",
  }),
  account("btc", {
    unit: "CRYPTOCURRENCY",
    currency: null,
    cryptocurrency: " btc ",
    assetClassId: null,
    groupId: null,
  }),
  account("invalid-class", { assetClassId: "deleted" }),
  account("unknown", { currency: null }),
];
const attribution = buildGainLossAccountAttribution({
  assetClasses,
  baseAssetLiabilityAccounts: accounts,
  transferClearingUnitBuckets: [],
  executionResidualTransactions: [],
});

describe("allocation investment hierarchy", () => {
  it.each(["asset", "liability"] as const)(
    "groups %s balances by the same investments as G/L, preserving subclasses and raw totals",
    (side) => {
      const items = accounts.map((account, i) => ({
        accountId: account.id,
        accountName: account.name,
        groupId: account.groupId,
        accountType: account.type,
        assetClassId: account.assetClassId,
        investmentGroup: attribution.get(account.id)!.investmentGroup,
        convertedBalanceInReferenceCurrency: toMoney(
          (i + 1) * (side === "asset" ? 10 : -10),
        ),
      }));
      const result = toNumericMoney(
        buildPeriodEndAllocationBreakdown({
          side,
          grouping: "assetClass",
          items,
          groupById,
          assetClasses,
        }),
      );
      const structure = toNumericMoney(
        buildPeriodEndAllocationBreakdown({
          side,
          grouping: "accountStructure",
          items,
          groupById,
        }),
      );
      expect(result.totalAmount).toBe(360);
      expect(result.totalAmount).toBe(structure.totalAmount);
      expect(result.hasHiddenAmountDiscrepancy).toBe(false);
      const [investments, unclassified] = result.hierarchy;
      expect(
        investments.children.map((node) => [node.id, node.amount]),
      ).toEqual([
        ["asset-class:equities", 90],
        ["allocation-investment:investments:unknown", 80],
        ["allocation-investment:investments:managed-portfolios", 50],
        ["allocation-investment:investments:CURRENCY:CHF", 10],
      ]);
      expect(investments.children[0].children[0]).toMatchObject({
        id: "allocation-investment:equities:SECURITY:AAPL",
        label: "AAPL",
        amount: 90,
        children: [
          {
            id: "account:aapl-eur",
            label: "Holding",
            accountGroupPath: ["Bank", "Brokerage"],
            amount: 50,
          },
          {
            id: "account:aapl-usd",
            label: "Holding",
            accountGroupPath: ["Bank", "Brokerage"],
            amount: 40,
          },
        ],
      });
      expect(unclassified).toMatchObject({
        id: "asset-class:unclassified",
        amount: 130,
        children: [
          { id: "allocation-investment:unclassified:CURRENCY:CHF", amount: 70 },
          {
            id: "allocation-investment:unclassified:CRYPTOCURRENCY:BTC",
            amount: 60,
            children: [{ accountGroupPath: [] }],
          },
        ],
      });
      expect(structure.hierarchy[0]).not.toHaveProperty("accountGroupPath");

      const gains = toNumericMoney(
        buildGainsLossesBreakdown({
          grouping: "assetClass",
          accounts,
          groupById,
          assetClasses,
          accountAttributionById: attribution,
          referenceCurrency: "CHF",
          contributions: accounts.map((account, i) => ({
            ...account,
            unit: account.unit!,
            accountId: account.id,
            accountName: account.name,
            sourceKind: "HOLDING",
            realizedGainLoss: toMoney((i + 1) * 10),
            unrealizedGainLoss: toMoney(0),
          })),
        }),
      );
      const gainInvestments = gains.hierarchy[0];
      expect(gainInvestments.children.map((node) => node.label)).toEqual([
        "Equities",
        "CHF",
        "Total Value Accounts",
        "Unknown Unit",
      ]);
      expect(gainInvestments.children[0].children[0]).toMatchObject({
        label: "AAPL",
        totalGainLoss: 90,
        children: [
          {
            id: "gain-loss-account:aapl-eur",
            accountGroupPath: ["Bank", "Brokerage"],
          },
          {
            id: "gain-loss-account:aapl-usd",
            accountGroupPath: ["Bank", "Brokerage"],
          },
        ],
      });
      expect(
        gainInvestments.children.find(
          (node) => node.label === "Total Value Accounts",
        ),
      ).toMatchObject({ totalGainLoss: 50 });
    },
  );

  it("marks discrepancies on investment groups and their asset-class ancestors", () => {
    const result = toNumericMoney(
      buildPeriodEndAllocationBreakdown({
        side: "asset",
        grouping: "assetClass",
        groupById,
        assetClasses,
        items: ["0.006", "0.004", "0.004", "0.004"].map((amount, i) => ({
          accountId: String(i),
          accountName: String(i),
          groupId: null,
          accountType: "BALANCE",
          assetClassId: "equities",
          investmentGroup: { key: "SECURITY:AAPL", label: "AAPL" },
          convertedBalanceInReferenceCurrency: toMoney(amount),
        })),
      }),
    );
    expect(result.totalAmount).toBe(0.02);
    expect(result.hierarchy[0].children[0].children[0]).toMatchObject({
      amount: 0.02,
      children: [{ amount: 0.01 }],
    });
    expect(result.hasHiddenAmountDiscrepancy).toBe(true);
    expect(result.hiddenAmountDiscrepancyNodeIds.toSorted()).toEqual([
      "allocation-investment:equities:SECURITY:AAPL",
      "asset-class:equities",
      "asset-class:investments",
    ]);
  });

  it("keeps synthetic G/L labels without assigning an originating account's path", () => {
    const result = buildGainsLossesBreakdown({
      grouping: "assetClass",
      accounts,
      groupById,
      referenceCurrency: "CHF",
      contributions: [
        {
          sourceKind: "EXPLICIT",
          accountId: "residual",
          accountName: "Recorded Adjustment",
          unit: "CURRENCY",
          currency: "CHF",
          cryptocurrency: null,
          symbol: null,
          tradeCurrency: null,
          realizedGainLoss: toMoney(1),
          unrealizedGainLoss: toMoney(0),
        },
      ],
    });
    const leaf = result.hierarchy[0].children[0].children[0];
    expect(leaf.label).toBe("Recorded Adjustment");
    expect(leaf).not.toHaveProperty("accountGroupPath");
  });
});
