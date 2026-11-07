import { describe, expect, it, vi } from "vitest";
import { Unit } from "../../.prisma-client/enums";
import { toMoney } from "../../shared/money";
import { toNumericMoney } from "../money-boundary";
import { decodeMoneyCache, encodeMoneyCache } from "../money-cache-codec";
import type { PeriodBaseData } from "./base-data/period-base-data-types";
import {
  buildRealAccountReconciliation,
  createScenario,
  getOrLoadPeriodBaseData,
  loadAccountGainLossSources,
  loadPeriodHistoryPointMetrics,
  loadPeriodOverview,
  prisma,
} from "./period-decimal-pipeline.test-support";

describe("Decimal monetary pipelines", () => {
  it("agrees across overview, history, FIFO reconciliation, and cached base inputs", async () => {
    vi.clearAllMocks();
    const scenario = createScenario();
    const overview = await loadPeriodOverview({
      accountBookId: "book-1",
      baseData: scenario,
    });
    const warm = decodeMoneyCache<PeriodBaseData>(
      JSON.parse(JSON.stringify(encodeMoneyCache(scenario))),
    );
    getOrLoadPeriodBaseData.mockResolvedValue(warm);
    const history = toNumericMoney(
      await loadPeriodHistoryPointMetrics({
        accountBookId: "book-1",
        period: "2026-02",
      }),
    );
    expect(history.gainsLosses).toBe(7.1);
    expect(history.income).toBe(0.34);
    expect(history.savings).toBe(0.34);
    expect(history.totalReturn).toBe(7.44);
    expect(history).toMatchObject({
      income: overview.stats.income,
      savings: overview.stats.savings,
      totalReturn: overview.stats.totalReturn,
      gainsLosses: overview.stats.gainsLosses,
      assets: overview.stats.endOfPeriodAssets,
      netWorth: overview.stats.endOfPeriodNetWorth,
    });
    expect(
      await loadPeriodOverview({ accountBookId: "book-1", baseData: warm }),
    ).toEqual(overview);
    expect(prisma.account.findFirst).not.toHaveBeenCalled();
    expect(prisma.account.findMany).not.toHaveBeenCalled();
    expect(prisma.booking.groupBy).not.toHaveBeenCalled();
    expect(prisma.transaction.findMany).not.toHaveBeenCalled();

    const holding = scenario.baseAssetLiabilityAccounts[0]!;
    const reconciliation = await buildRealAccountReconciliation({
      baseData: warm,
      accountId: holding.id,
    });
    expect(prisma.account.findFirst).not.toHaveBeenCalled();
    expect(prisma.account.findMany).not.toHaveBeenCalled();
    expect(prisma.booking.groupBy).not.toHaveBeenCalled();
    expect(prisma.transaction.findMany).not.toHaveBeenCalled();
    expect(reconciliation?.summary).toEqual({
      realizedGainLoss: 1.7,
      unrealizedGainLoss: 5.4,
      totalGainLoss: history.gainsLosses,
    });
    expect(reconciliation?.realizedEvents[0]?.quantity).toBe(-0.1);
    expect(reconciliation?.unrealizedOpenLots[0]?.quantity).toBe(0.2);
    expect(typeof JSON.parse(JSON.stringify(overview)).stats.gainsLosses).toBe(
      "number",
    );
  });

  it("calculates residuals from supplied base inputs in overview and history without database reads", async () => {
    vi.clearAllMocks();
    const scenario = createScenario();
    const booking = scenario.holdingTransactions[0]!.bookings[0]!;
    scenario.executionResidualTransactions = [
      {
        id: "residual",
        bookings: [
          {
            ...booking,
            id: "expense-security",
            accountId: "expense-security",
            value: toMoney("0.5"),
            account: { name: "Security Expense" },
          },
          {
            ...booking,
            id: "cash",
            accountId: "cash",
            unit: Unit.CURRENCY,
            currency: "CHF",
            symbol: null,
            tradeCurrency: null,
            value: toMoney("-90"),
            account: { name: "Cash" },
          },
        ],
      },
    ];
    const overview = await loadPeriodOverview({
      accountBookId: "book-1",
      baseData: scenario,
    });
    const history = toNumericMoney(
      await loadPeriodHistoryPointMetrics({
        accountBookId: "book-1",
        baseData: scenario,
      }),
    );
    const residualExplanation = toNumericMoney(
      await loadAccountGainLossSources(scenario, "expense-security"),
    );
    expect(residualExplanation.executionResiduals).toMatchObject([
      { transactionId: "residual", id: "expense-security" },
    ]);
    expect(residualExplanation.node?.totalGainLoss).toBe(-19.94);
    expect(overview.stats.gainsLosses).toBe(-12.84);
    expect(history.gainsLosses).toBe(overview.stats.gainsLosses);
    expect(history.totalReturn).toBe(overview.stats.totalReturn);
    expect(prisma.account.findFirst).not.toHaveBeenCalled();
    expect(prisma.account.findMany).not.toHaveBeenCalled();
    expect(prisma.booking.groupBy).not.toHaveBeenCalled();
    expect(prisma.transaction.findMany).not.toHaveBeenCalled();
  });
});
