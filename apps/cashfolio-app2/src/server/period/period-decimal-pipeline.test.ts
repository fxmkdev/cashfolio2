import { describe, expect, it, vi } from "vitest";
import {
  AssetClass,
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../../.prisma-client/enums";
import { moneyMultiply, toMoney } from "../../shared/money";
import { toNumericMoney } from "../money-boundary";
import { decodeMoneyCache, encodeMoneyCache } from "../money-cache-codec";
import type { PeriodBaseData } from "./base-data/period-base-data-types";

const prisma = vi.hoisted(() => ({
  account: { findFirst: vi.fn(), findMany: vi.fn() },
  booking: { groupBy: vi.fn() },
  transaction: { findMany: vi.fn() },
}));
const getOrLoadPeriodBaseData = vi.hoisted(() => vi.fn());
vi.mock("../../prisma.server", () => ({ prisma }));
vi.mock("./cache/period-base-data-cache", () => ({ getOrLoadPeriodBaseData }));
vi.mock("../valuation.server", () => ({
  getCurrencyExchangeRate: async ({ date }: { date: Date }) =>
    toMoney(date.getUTCMonth() === 0 ? "0.8" : "0.9"),
  getCurrencyExchangeRateDetails: async ({ date }: { date: Date }) => ({
    rate: toMoney(date.getUTCMonth() === 0 ? "0.8" : "0.9"),
    source: "timeSeries",
  }),
  getSecurityToCurrencyExchangeRate: async ({ date }: { date: Date }) =>
    securityRate(date),
  getSecurityToCurrencyExchangeRateDetails: async ({
    date,
  }: {
    date: Date;
  }) => ({ rate: securityRate(date), source: "timeSeries" }),
}));

import { loadPeriodOverview } from "./overview/period-overview.server";
import { loadPeriodHistoryPointMetrics } from "./history/period-history-point-metrics.server";
import { buildRealAccountReconciliation } from "./reconciliation/period-gain-loss-reconciliation-real-account";
import { loadAccountGainLossSources } from "./reconciliation/period-account-gain-loss-sources";
import { computeEndOfPeriodBalanceStats } from "./period-balance-stats";

function securityRate(date: Date) {
  return toMoney(
    date.getUTCMonth() === 0
      ? "123.123456789123456789"
      : date.getUTCDate() === 28
        ? "150.123456789123456789"
        : "140.123456789123456789",
  );
}

function createScenario(): PeriodBaseData {
  const holding = {
    id: "security",
    name: "Security",
    groupId: null,
    type: AccountType.BALANCE,
    unit: Unit.SECURITY,
    currency: null,
    cryptocurrency: null,
    symbol: "ABC",
    tradeCurrency: "CHF",
    assetClass: null,
    isCashAccount: false,
  };
  const date = new Date("2026-02-15T00:00:00Z");
  return {
    accountBookId: "book-1",
    periodValue: "2026-02",
    referenceCurrency: "CHF",
    selection: {
      periodValue: "2026-02",
      label: "Feb 2026",
      periodSpecifier: "month",
      granularity: "month",
      year: 2026,
      month: 1,
      from: new Date("2026-02-01"),
      to: new Date("2026-02-28"),
      queryEndExclusive: new Date("2026-03-01"),
      initialHoldingDate: new Date("2026-01-31"),
      isBeforeAccountBookStart: false,
      minPeriodDate: new Date("2026-01-01"),
    },
    allAccountGroups: [],
    baseAssetLiabilityAccounts: [holding],
    holdingAccountsResolved: [holding],
    endOfPeriodRawBalances: [
      { accountId: holding.id, rawBalance: toMoney("0.2") },
    ],
    transferClearingUnitBuckets: [],
    explicitCounterparts: [],
    executionResidualTransactions: [],
    initialHoldingBalances: [
      { accountId: holding.id, rawBalance: toMoney("0.3") },
    ],
    holdingTransactions: [
      {
        id: "sell",
        bookings: [
          {
            id: "security-close",
            accountId: holding.id,
            date,
            value: toMoney("-0.1"),
            unit: Unit.SECURITY,
            currency: null,
            cryptocurrency: null,
            symbol: "ABC",
            tradeCurrency: "CHF",
            accountType: AccountType.BALANCE,
            equityAccountSubtype: null,
          },
          {
            id: "cash-close",
            accountId: "cash",
            date,
            value: moneyMultiply("0.1", securityRate(date)),
            unit: Unit.CURRENCY,
            currency: "CHF",
            cryptocurrency: null,
            symbol: null,
            tradeCurrency: null,
            accountType: AccountType.BALANCE,
            equityAccountSubtype: null,
          },
        ],
      },
    ],
    equityBookings: ["-0.1", "-0.235"].map((value, index) => ({
      id: `income-${index}`,
      accountId: "income",
      accountName: "Income",
      accountGroupId: null,
      equityAccountSubtype: EquityAccountSubtype.INCOME,
      transactionId: `income-${index}`,
      date,
      value: toMoney(value),
      unit: Unit.CURRENCY,
      currency: "CHF",
      cryptocurrency: null,
      symbol: null,
      tradeCurrency: null,
    })),
    cashFlowTransactions: [],
    hasCashAccounts: false,
  };
}

describe("Decimal monetary pipelines", () => {
  it("keeps overview and history amounts unchanged for every asset class", async () => {
    const scenario = createScenario();
    getOrLoadPeriodBaseData.mockResolvedValue(scenario);
    const args = { accountBookId: "book-1", period: "2026-02" };
    const overview = await loadPeriodOverview({ ...args, baseData: scenario });
    const history = await loadPeriodHistoryPointMetrics(args);
    for (const assetClass of Object.values(AssetClass)) {
      const classified: PeriodBaseData = {
        ...scenario,
        baseAssetLiabilityAccounts: scenario.baseAssetLiabilityAccounts.map(
          (account) => ({ ...account, assetClass }),
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
      assetClass: AssetClass.EQUITIES,
      unit: Unit.SECURITY,
    };
    const portfolio = {
      ...stock,
      id: "portfolio",
      name: "USD Equity Portfolio",
      unit: Unit.CURRENCY,
      currency: "USD",
      symbol: null,
      tradeCurrency: null,
    };
    const bank = {
      ...portfolio,
      id: "bank",
      name: "USD Bank",
      assetClass: AssetClass.CASH_AND_CASH_EQUIVALENTS,
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
    const leaves = overview.gainsLossesBreakdown.hierarchy.flatMap(
      (node) => node.children,
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
      overview.gainsLossesBreakdown.hierarchy.map((node) => [
        node.label,
        node.totalGainLoss,
      ]),
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
      const reclassified = {
        ...baseData,
        baseAssetLiabilityAccounts: baseData.baseAssetLiabilityAccounts.map(
          (account) =>
            account.id === "portfolio"
              ? { ...account, assetClass: AssetClass.OTHER_ASSETS }
              : account,
        ),
      };
      const changed = await loadPeriodOverview({
        accountBookId: "book-1",
        baseData: reclassified,
      });
      expect(changed.stats).toEqual(overview.stats);
      expect(
        changed.gainsLossesBreakdown.hierarchy.find(
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
    prisma.account.findFirst.mockResolvedValue(holding);
    prisma.account.findMany.mockResolvedValue([holding]);
    prisma.booking.groupBy.mockResolvedValue([
      { accountId: holding.id, _sum: { value: { toString: () => "0.3" } } },
    ]);
    prisma.transaction.findMany.mockResolvedValueOnce(
      scenario.holdingTransactions.map((transaction) => ({
        ...transaction,
        bookings: transaction.bookings.map((booking) => ({
          ...booking,
          value: { toString: () => booking.value.toString() },
          account: {
            type: booking.accountType,
            equityAccountSubtype: booking.equityAccountSubtype,
          },
        })),
      })),
    );
    const reconciliation = await buildRealAccountReconciliation({
      accountBookId: "book-1",
      accountId: holding.id,
      queryStart: scenario.selection.from,
      queryEndExclusive: scenario.selection.queryEndExclusive,
      initialHoldingDate: scenario.selection.initialHoldingDate,
      periodEnd: scenario.selection.to,
      referenceCurrency: "CHF",
      isBeforeAccountBookStart: false,
    });
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
      expect(overview.assetBreakdown.totalAmount).toBe(history.assets);
      expect(overview.liabilityBreakdown.totalAmount).toBe(history.liabilities);
      for (const metric of ["assets", "liabilities"] as const) {
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
  const { buildResidualAllocationWeights } =
    await import("./holdings/period-overview-holdings-common");
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
