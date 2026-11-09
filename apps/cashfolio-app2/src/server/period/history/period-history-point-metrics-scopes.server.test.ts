import { beforeEach, describe, expect, test } from "vitest";
import { Unit } from "../../../.prisma-client/enums";
import { toMoney } from "../../../shared/money";
import { toNumericMoney } from "../../money-boundary";
import {
  computePeriodHoldingGainLoss,
  convertBookingValueToReferenceDetails,
  createBaseData,
  getOrLoadPeriodBaseData,
  getUnitToReferenceExchangeRateDetails,
  loadPeriodHistoryPointMetrics,
  processPeriodEquityBookingsFromBaseData,
  resetHistoryMetrics,
} from "./period-history-point-metrics.server.test-support";

describe("loadPeriodHistoryPointMetrics", () => {
  beforeEach(resetHistoryMetrics);

  test("builds Gain/Loss scope options and resolves scoped Gain/Loss values", async () => {
    const baseData = createBaseData();
    getOrLoadPeriodBaseData.mockResolvedValue(baseData);
    processPeriodEquityBookingsFromBaseData.mockImplementation(
      async ({
        equityAggregation,
        gainsLossesContributionByKey,
      }: {
        equityAggregation: {
          income: number;
          expenses: number;
          explicitGainLoss: number;
        };
        gainsLossesContributionByKey: Map<string, unknown>;
      }) => {
        equityAggregation.income = 0;
        equityAggregation.expenses = 0;
        equityAggregation.explicitGainLoss = 5;
        gainsLossesContributionByKey.set("explicit:cash-1", {
          sourceKind: "EXPLICIT",
          accountId: "cash-1",
          accountName: "Cash",
          unit: Unit.CURRENCY,
          currency: "CHF",
          cryptocurrency: null,
          symbol: null,
          tradeCurrency: null,
          realizedGainLoss: toMoney(5),
          unrealizedGainLoss: toMoney(0),
        });
      },
    );
    computePeriodHoldingGainLoss.mockImplementation(
      async ({
        gainsLossesContributionByKey,
      }: {
        gainsLossesContributionByKey: Map<string, unknown>;
      }) => {
        gainsLossesContributionByKey.set("holding:usd-cash:fx:USD", {
          sourceKind: "HOLDING",
          accountId: "usd-cash",
          accountName: "USD Cash",
          unit: Unit.CURRENCY,
          currency: "USD",
          cryptocurrency: null,
          symbol: null,
          tradeCurrency: null,
          realizedGainLoss: toMoney(7),
          unrealizedGainLoss: toMoney(3),
        });
        return {
          realizedGainLoss: toMoney(7),
          unrealizedGainLoss: toMoney(3),
          convertedCount: 0,
          skippedCount: 0,
        };
      },
    );
    convertBookingValueToReferenceDetails.mockResolvedValue({
      value: toMoney(1),
      source: "identity",
    });
    getUnitToReferenceExchangeRateDetails.mockResolvedValue({
      rate: toMoney(1),
      source: "identity",
    });

    const result = await loadPeriodHistoryPointMetrics({
      accountBookId: "book-1",
      period: "2026-02",
      metricScopeFilter: {
        metric: "gainsLosses",
        scope: "gain-loss-account:usd-cash",
      },
    });

    expect(toNumericMoney(result.gainsLosses)).toBe(15);
    expect(toNumericMoney(result.scopedMetricValue)).toBe(10);
    expect(
      toNumericMoney(
        result.scopeOptions.gainsLosses.filter(
          (option) => option.grouping === "assetClass",
        ),
      ),
    ).toMatchObject([
      {
        value: "asset-class:unclassified",
        label: "Unclassified",
        kind: "gainLoss",
      },
      {
        value: "gain-loss-investment:unclassified:unknown",
        parentValue: "asset-class:unclassified",
      },
      {
        value: "gain-loss-account:cash-1",
        label: "Unclassified / Unknown Unit / Cash",
        accountId: "cash-1",
        parentValue: "gain-loss-investment:unclassified:unknown",
      },
      {
        value: "gain-loss-investment:unclassified:CURRENCY:USD",
        parentValue: "asset-class:unclassified",
      },
      {
        value: "gain-loss-account:usd-cash",
        label: "Unclassified / USD / USD Cash",
        accountId: "usd-cash",
        parentValue: "gain-loss-investment:unclassified:CURRENCY:USD",
      },
    ]);

    await expect(
      loadPeriodHistoryPointMetrics({
        accountBookId: "book-1",
        period: "2026-02",
        metricScopeFilter: {
          metric: "gainsLosses",
          scope: "asset-class:unclassified",
        },
      }).then(toNumericMoney),
    ).resolves.toMatchObject({ scopedMetricValue: 15 });
    await expect(
      loadPeriodHistoryPointMetrics({
        accountBookId: "book-1",
        period: "2026-02",
        metricScopeFilter: {
          metric: "gainsLosses",
          scope: "unit-account:fx:USD:usd-cash",
        },
      }).then(toNumericMoney),
    ).resolves.toMatchObject({ scopedMetricValue: 10 });
    await expect(
      loadPeriodHistoryPointMetrics({
        accountBookId: "book-1",
        period: "2026-02",
        metricScopeFilter: {
          metric: "gainsLosses",
          scope: "explicit-account:cash-1",
        },
      }).then(toNumericMoney),
    ).resolves.toMatchObject({ scopedMetricValue: 5 });
  });

  test("builds transactions-only scope options and resolves scoped income values", async () => {
    const baseData = createBaseData({
      overrides: {
        allAccountGroups: [
          { id: "grp-income", name: "Income", parentGroupId: null },
          {
            id: "grp-income-salary",
            name: "Salary",
            parentGroupId: "grp-income",
          },
        ],
      },
    });
    getOrLoadPeriodBaseData.mockResolvedValue(baseData);
    processPeriodEquityBookingsFromBaseData.mockImplementation(
      async ({
        equityAggregation,
      }: {
        equityAggregation: {
          income: number;
          expenses: number;
          explicitGainLoss: number;
          incomeAmountByAccountId: Map<string, unknown>;
          expenseAmountByAccountId: Map<string, unknown>;
        };
      }) => {
        equityAggregation.income = 130;
        equityAggregation.expenses = 0;
        equityAggregation.explicitGainLoss = 0;
        equityAggregation.incomeAmountByAccountId.set("income-a", {
          accountId: "income-a",
          accountName: "Primary Salary",
          groupId: "grp-income-salary",
          amount: toMoney(130),
        });
      },
    );
    computePeriodHoldingGainLoss.mockResolvedValue({
      realizedGainLoss: toMoney(0),
      unrealizedGainLoss: toMoney(0),
      convertedCount: 0,
      skippedCount: 0,
    });
    convertBookingValueToReferenceDetails.mockResolvedValue({
      value: toMoney(1),
      source: "identity",
    });
    getUnitToReferenceExchangeRateDetails.mockResolvedValue({
      rate: toMoney(1),
      source: "identity",
    });

    const result = await loadPeriodHistoryPointMetrics({
      accountBookId: "book-1",
      period: "2026-02",
      metricScopeFilter: {
        metric: "income",
        scope: "group:grp-income",
      },
    });

    expect(toNumericMoney(result.scopedMetricValue)).toBe(130);
    expect(toNumericMoney(result.scopeOptions.income)).toEqual([
      {
        value: "group:grp-income",
        label: "Income",
        kind: "group",
        treeLabel: "Income",
      },
      {
        value: "group:grp-income-salary",
        label: "Income / Salary",
        kind: "group",
        treeLabel: "Salary",
        parentValue: "group:grp-income",
      },
      {
        value: "account:income-a",
        label: "Income / Salary / Primary Salary",
        kind: "account",
        treeLabel: "Primary Salary",
        parentValue: "group:grp-income-salary",
      },
    ]);
    expect(toNumericMoney(result.scopeOptions.expenses)).toEqual([]);
  });

  test("guards scoped traversal against cyclic group hierarchies", async () => {
    const baseData = createBaseData({
      overrides: {
        allAccountGroups: [
          { id: "grp-root", name: "Root", parentGroupId: null },
          { id: "grp-cycle-a", name: "Cycle A", parentGroupId: "grp-cycle-b" },
          { id: "grp-cycle-b", name: "Cycle B", parentGroupId: "grp-cycle-a" },
        ],
      },
    });
    getOrLoadPeriodBaseData.mockResolvedValue(baseData);
    processPeriodEquityBookingsFromBaseData.mockImplementation(
      async ({
        equityAggregation,
      }: {
        equityAggregation: {
          income: number;
          expenses: number;
          explicitGainLoss: number;
          incomeAmountByAccountId: Map<string, unknown>;
          expenseAmountByAccountId: Map<string, unknown>;
        };
      }) => {
        equityAggregation.income = 50;
        equityAggregation.expenses = 0;
        equityAggregation.explicitGainLoss = 0;
        equityAggregation.incomeAmountByAccountId.set("income-cycle", {
          accountId: "income-cycle",
          accountName: "Cycle Income",
          groupId: "grp-cycle-a",
          amount: toMoney(50),
        });
      },
    );
    computePeriodHoldingGainLoss.mockResolvedValue({
      realizedGainLoss: toMoney(0),
      unrealizedGainLoss: toMoney(0),
      convertedCount: 0,
      skippedCount: 0,
    });
    convertBookingValueToReferenceDetails.mockResolvedValue({
      value: toMoney(1),
      source: "identity",
    });
    getUnitToReferenceExchangeRateDetails.mockResolvedValue({
      rate: toMoney(1),
      source: "identity",
    });

    const result = await loadPeriodHistoryPointMetrics({
      accountBookId: "book-1",
      period: "2026-02",
      metricScopeFilter: {
        metric: "income",
        scope: "group:grp-root",
      },
    });

    expect(toNumericMoney(result.scopedMetricValue)).toBe(0);
    const optionValues = result.scopeOptions.income.map(
      (option) => option.value,
    );
    expect(optionValues).toHaveLength(3);
    expect(toNumericMoney(optionValues)).toEqual(
      expect.arrayContaining([
        "group:grp-cycle-a",
        "group:grp-cycle-b",
        "account:income-cycle",
      ]),
    );
  });
});
