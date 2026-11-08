import { describe, expect, it } from "vitest";
import { AccountType, Unit } from "../../.prisma-client/enums";
import { moneyMultiply, toMoney } from "../../shared/money";
import { toNumericMoney } from "../money-boundary";
import {
  computeEndOfPeriodBalanceStats,
  createScenario,
  loadPeriodHistoryPointMetrics,
  loadPeriodOverview,
} from "./period-decimal-pipeline.test-support";

describe("Decimal monetary pipelines", () => {
  it.each([
    ["2026-01", "month", 100, 20],
    ["2026-02", "month", 0, 0],
    ["2026-03", "month", -25, -40],
    ["2024", "year", 100, 20],
    ["2025", "year", -25, -40],
  ] as const)(
    "keeps Report and scoped History consistent for %s",
    async (period, granularity, bankBalance, cardBalance) => {
      const scenario = createScenario();
      const template = scenario.baseAssetLiabilityAccounts[0]!;
      const bank = {
        ...template,
        id: "bank",
        name: "Bank",
        groupId: "banking",
        unit: Unit.CURRENCY,
        currency: "CHF",
        symbol: null,
        tradeCurrency: null,
      };
      const card = {
        ...bank,
        id: "card",
        name: "Card",
        type: AccountType.BALANCE,
      };
      scenario.baseAssetLiabilityAccounts = [bank, card];
      scenario.allAccountGroups = [
        { id: "banking", name: "Banking", parentGroupId: null },
      ];
      scenario.endOfPeriodRawBalances = [
        { accountId: bank.id, rawBalance: toMoney(bankBalance) },
        { accountId: card.id, rawBalance: toMoney(cardBalance) },
      ];
      scenario.holdingAccountsResolved = [];
      scenario.holdingTransactions = [];
      scenario.initialHoldingBalances = [];
      scenario.equityBookings = [];
      scenario.selection = {
        ...scenario.selection,
        periodValue: period,
        granularity,
      };
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
      expect(history.assets).toBe(overview.stats.endOfPeriodAssets);
      expect(history.liabilities).toBe(overview.stats.endOfPeriodLiabilities);
      expect(history.netWorth).toBe(bankBalance + cardBalance);
      expect(
        overview.accountBreakdownsByGrouping.accountStructure.assetBreakdown
          .totalAmount,
      ).toBe(history.assets);
      expect(
        overview.accountBreakdownsByGrouping.accountStructure.liabilityBreakdown
          .totalAmount,
      ).toBe(history.liabilities);
      for (const metric of ["netWorth"] as const) {
        const scoped = await loadPeriodHistoryPointMetrics({
          accountBookId: "book-1",
          baseData: scenario,
          metricScopeFilter: { metric, scope: "group:banking" },
        });
        expect(toNumericMoney(scoped.scopedMetricValue)).toBe(history[metric]);
      }
      expect(overview.stats.gainsLosses).toBe(0);
      expect(overview.stats.totalReturn).toBe(0);
    },
  );

  it("cancels large account balances before the numeric response boundary", async () => {
    const scenario = createScenario();
    const first = scenario.baseAssetLiabilityAccounts[0]!;
    const second = { ...first, id: "offset" };
    const stats = await computeEndOfPeriodBalanceStats({
      accounts: [first, second],
      rawBalanceByAccountId: new Map([
        [first.id, toMoney("9007199254740993.123456789123456789")],
        [second.id, toMoney("-9007199254740993.12")],
      ]),
      periodEnd: scenario.selection.to,
      referenceCurrency: "CHF",
      convertBalanceToReference: async ({ value }) => value,
    });
    expect(stats.assets.toString()).toBe("9007199254740993.123456789123456789");
    expect(stats.liabilities.toString()).toBe("9007199254740993.12");
    expect(stats.netWorth.toString()).toBe("0.003456789123456789");
  });
});

it("allocates fractional residuals using Decimal weights", async () => {
  const { buildResidualAllocationWeights } = await import("../holdings/common");
  const { moneySum } = await import("../../shared/money");
  const source = createScenario().holdingTransactions[0]!.bookings[0]!;
  const bookings = [source, { ...source, id: "second" }];
  const weights = buildResidualAllocationWeights({
    holdingBookings: bookings,
    holdingMarketValueByBookingId: new Map([
      [source.id, toMoney("0.1")],
      ["second", toMoney("0.3")],
    ]),
  });
  expect(weights.map((weight) => weight.toString())).toEqual(["0.25", "0.75"]);
  const allocations = weights.map((weight) => moneyMultiply("0.1", weight));
  expect(allocations.map((amount) => amount.toString())).toEqual([
    "0.025",
    "0.075",
  ]);
  expect(moneySum(allocations).toString()).toBe("0.1");
});
