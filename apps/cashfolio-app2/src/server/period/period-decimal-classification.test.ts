import { describe, expect, it } from "vitest";
import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../../.prisma-client/enums";
import { defaultAssetClassIds } from "../../shared/asset-class";
import { toMoney } from "../../shared/money";
import { toNumericMoney } from "../money-boundary";
import type { PeriodBaseData } from "./base-data/period-base-data-types";
import {
  createScenario,
  getOrLoadPeriodBaseData,
  loadAccountGainLossSources,
  loadPeriodHistoryPointMetrics,
  loadPeriodOverview,
} from "./period-decimal-pipeline.test-support";

describe("Decimal monetary pipelines", () => {
  it("keeps overview and history amounts unchanged for every asset class", async () => {
    const scenario = createScenario();
    getOrLoadPeriodBaseData.mockResolvedValue(scenario);
    const args = { accountBookId: "book-1", period: "2026-02" };
    const overview = await loadPeriodOverview({ ...args, baseData: scenario });
    const history = await loadPeriodHistoryPointMetrics(args);
    for (const assetClassId of Object.values(defaultAssetClassIds)) {
      const classified: PeriodBaseData = {
        ...scenario,
        baseAssetLiabilityAccounts: scenario.baseAssetLiabilityAccounts.map(
          (account) => ({ ...account, assetClassId }),
        ),
      };
      getOrLoadPeriodBaseData.mockResolvedValue(classified);
      expect(
        await loadPeriodOverview({ ...args, baseData: classified }),
      ).toMatchObject({ stats: overview.stats });
      const { scopeOptions: _scopeOptions, ...amounts } = history;
      expect(await loadPeriodHistoryPointMetrics(args)).toMatchObject(amounts);
    }
  });

  it("combines USD equity FX and recorded adjustments, includes CHF adjustments, and reclassifies every period", async () => {
    const scenario = createScenario();
    const stock = {
      ...scenario.baseAssetLiabilityAccounts[0]!,
      assetClassId: defaultAssetClassIds.EQUITIES,
      unit: Unit.SECURITY,
    };
    const portfolio = {
      ...stock,
      id: "portfolio",
      name: "USD Equity Portfolio",
      trackingMethod: "TOTAL_PORTFOLIO_VALUE" as const,
      unit: Unit.CURRENCY,
      currency: "USD",
      symbol: null,
      tradeCurrency: null,
    };
    const bank = {
      ...portfolio,
      id: "bank",
      name: "USD Bank",
      trackingMethod: "INDIVIDUAL_UNITS" as const,
      assetClassId: defaultAssetClassIds.CASH_AND_CASH_EQUIVALENTS,
    };
    const chf = {
      ...portfolio,
      id: "chf",
      name: "CHF Portfolio",
      currency: "CHF",
    };
    scenario.baseAssetLiabilityAccounts = [stock, portfolio, bank, chf];
    scenario.holdingAccountsResolved = [stock, portfolio, bank];
    scenario.initialHoldingBalances.push(
      { accountId: "portfolio", rawBalance: toMoney(100) },
      { accountId: "bank", rawBalance: toMoney(200) },
    );
    scenario.endOfPeriodRawBalances.push(
      { accountId: "portfolio", rawBalance: toMoney(120) },
      { accountId: "bank", rawBalance: toMoney(200) },
      { accountId: "chf", rawBalance: toMoney(50) },
    );
    for (const [account, amount] of [
      [portfolio, 20],
      [chf, 5],
    ] as const) {
      const booking = {
        ...scenario.equityBookings[0]!,
        id: `adjustment-${account.id}`,
        transactionId: `adjustment-${account.id}`,
        accountId: "gain-loss",
        equityAccountSubtype: EquityAccountSubtype.GAIN_LOSS,
        value: toMoney(amount).neg(),
        currency: account.currency,
        description: "Recorded investment gain",
      };
      scenario.equityBookings.push(booking);
      scenario.explicitCounterparts.push({
        transactionId: booking.transactionId,
        accountId: account.id,
        accountName: account.name,
      });
      scenario.holdingTransactions.push({
        id: booking.transactionId,
        bookings: [
          {
            ...booking,
            accountId: account.id,
            value: toMoney(amount),
            accountType: AccountType.BALANCE,
            equityAccountSubtype: null,
          },
          { ...booking, accountType: AccountType.EQUITY },
        ],
      });
    }
    const overview = await loadPeriodOverview({
      accountBookId: "book-1",
      baseData: scenario,
    });
    const assetClassHierarchy =
      overview.accountBreakdownsByGrouping.assetClass.gainsLossesBreakdown
        .hierarchy;
    expect(
      assetClassHierarchy
        .find((node) => node.id === "asset-class:EQUITIES")
        ?.children.find((node) => node.label === "Total Value Accounts"),
    ).toMatchObject({
      children: expect.arrayContaining([
        expect.objectContaining({
          id: "gain-loss-account:portfolio",
          totalGainLoss: 28,
        }),
      ]),
    });
    const leaves = assetClassHierarchy.flatMap((node) =>
      node.children.flatMap((group) => group.children),
    );
    expect(
      leaves.find((node) => node.account?.id === "portfolio"),
    ).toMatchObject({
      totalGainLoss: 28,
      account: {
        sources: ["EXPLICIT", "HOLDING"],
        recordedGainLoss: 18,
        calculatedUnrealizedGainLoss: 10,
      },
    });
    expect(
      overview.accountBreakdownsByGrouping.assetClass.gainsLossesBreakdown.hierarchy.map(
        (node) => [node.label, node.totalGainLoss],
      ),
    ).toEqual([
      ["Cash & Cash Equivalents", 20],
      ["Equities", 40.1],
    ]);
    expect(overview.stats.gainsLosses).toBe(60.1);
    const explanation = toNumericMoney(
      await loadAccountGainLossSources(scenario, "portfolio"),
    );
    expect(explanation.node?.totalGainLoss).toBe(28);
    expect(explanation.recordedAdjustments).toMatchObject([
      {
        amount: 18,
        transactionId: "adjustment-portfolio",
        description: "Recorded investment gain",
      },
    ]);
    const chfExplanation = toNumericMoney(
      await loadAccountGainLossSources(scenario, "chf"),
    );
    expect(chfExplanation.node?.totalGainLoss).toBe(5);
    for (const granularity of ["month", "year"] as const) {
      const baseData = {
        ...scenario,
        selection: { ...scenario.selection, granularity },
      };
      const history = toNumericMoney(
        await loadPeriodHistoryPointMetrics({
          accountBookId: "book-1",
          baseData,
          metricScopeFilter: {
            metric: "gainsLosses",
            scope: "gain-loss-account:portfolio",
          },
        }),
      );
      expect(history.gainsLosses).toBe(overview.stats.gainsLosses);
      expect(history.scopedMetricValue).toBe(28);
      const structureHistory = toNumericMoney(
        await loadPeriodHistoryPointMetrics({
          accountBookId: "book-1",
          baseData,
          metricScopeFilter: {
            metric: "gainsLosses",
            scope: "account:portfolio",
          },
        }),
      );
      expect(structureHistory.scopedMetricValue).toBe(
        history.scopedMetricValue,
      );
      expect(
        overview.accountBreakdownsByGrouping.accountStructure
          .gainsLossesBreakdown.totalGainLoss,
      ).toBe(overview.stats.gainsLosses);
      expect(
        overview.accountBreakdownsByGrouping.assetClass.gainsLossesBreakdown
          .totalGainLoss,
      ).toBe(overview.stats.gainsLosses);
      const managed = toNumericMoney(
        await loadPeriodHistoryPointMetrics({
          accountBookId: "book-1",
          baseData,
          metricScopeFilter: {
            metric: "gainsLosses",
            scope: "gain-loss-investment:EQUITIES:managed-portfolios",
          },
        }),
      );
      expect(managed.scopedMetricValue).toBe(33);
      expect(managed.gainsLosses).toBe(overview.stats.gainsLosses);
      const reclassified = {
        ...baseData,
        baseAssetLiabilityAccounts: baseData.baseAssetLiabilityAccounts.map(
          (account) =>
            account.id === "portfolio"
              ? { ...account, assetClassId: defaultAssetClassIds.OTHER_ASSETS }
              : account,
        ),
      };
      const changed = await loadPeriodOverview({
        accountBookId: "book-1",
        baseData: reclassified,
      });
      expect(changed.stats).toEqual(overview.stats);
      expect(
        changed.accountBreakdownsByGrouping.assetClass.gainsLossesBreakdown.hierarchy.find(
          (node) => node.label === "Other Assets",
        )?.totalGainLoss,
      ).toBe(28);
      const changedHistory = toNumericMoney(
        await loadPeriodHistoryPointMetrics({
          accountBookId: "book-1",
          baseData: reclassified,
          metricScopeFilter: {
            metric: "gainsLosses",
            scope: "asset-class:OTHER_ASSETS",
          },
        }),
      );
      expect(changedHistory.scopedMetricValue).toBe(28);
      expect(changedHistory.gainsLosses).toBe(overview.stats.gainsLosses);
    }
  });
});
