import { describe, expect, it, vi } from "vitest";
import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../../.prisma-client/enums";
import { moneyMultiply, toMoney } from "../../shared/money";
import { toNumericMoney } from "../money-boundary";
import { decodeMoneyCache, encodeMoneyCache } from "../money-cache-codec";
import type { PeriodBaseData } from "./period-base-data-types";

const prisma = vi.hoisted(() => ({
  account: { findFirst: vi.fn(), findMany: vi.fn() },
  booking: { groupBy: vi.fn() },
  transaction: { findMany: vi.fn() },
}));
const getOrLoadPeriodBaseData = vi.hoisted(() => vi.fn());
vi.mock("../../prisma.server", () => ({ prisma }));
vi.mock("./period-base-data-cache", () => ({ getOrLoadPeriodBaseData }));
vi.mock("../valuation.server", () => ({
  getSecurityToCurrencyExchangeRate: async ({ date }: { date: Date }) =>
    securityRate(date),
  getSecurityToCurrencyExchangeRateDetails: async ({
    date,
  }: {
    date: Date;
  }) => ({ rate: securityRate(date), source: "timeSeries" }),
}));

import { loadPeriodOverview } from "./period-overview.server";
import { loadPeriodHistoryPointMetrics } from "./period-history-point-metrics.server";
import { buildRealAccountReconciliation } from "./period-gain-loss-reconciliation-real-account";
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
    type: AccountType.ASSET,
    unit: Unit.SECURITY,
    currency: null,
    cryptocurrency: null,
    symbol: "ABC",
    tradeCurrency: "CHF",
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
            accountType: AccountType.ASSET,
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
            accountType: AccountType.ASSET,
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
  it("agrees across overview, history, FIFO reconciliation, and cached base inputs", async () => {
    prisma.transaction.findMany.mockResolvedValue([]);
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
    expect(stats.assets.toString()).toBe("0.003456789123456789");
    expect(stats.netWorth.toString()).toBe("0.003456789123456789");
  });
});

it("allocates fractional residuals using Decimal weights", async () => {
  const { buildResidualAllocationWeights } =
    await import("./period-overview-holdings-common");
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
